/**
 * _worker.js — Cloudflare Pages Worker for inventory.snabbb.com
 *
 * Intercepts HTML requests, fetches the user's theme from Odoo server-side,
 * and injects window.__SNABBB_THEME__ into <head> before the browser sees it.
 * Zero flash. No cookie dependency on first load.
 *
 * Place at: public/_worker.js
 */

const ODOO_BASE_URL = 'https://mrbur.odoo.com';
const ODOO_THEME_URL = 'https://mrbur.odoo.com/api/user/theme';
const COOKIE_NAME    = 'snabbb-theme';
const COOKIE_DOMAIN  = '.snabbb.com';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const VALID_THEMES   = new Set(['light', 'dark', 'system']);
const DEFAULT_THEME  = 'light';

function parseTheme(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return VALID_THEMES.has(s) ? s : null;
}

function readThemeCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)snabbb-theme=([^;]+)/);
  return m ? parseTheme(decodeURIComponent(m[1])) : null;
}

function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';

  return cookieHeader.split(';').reduce((cookies, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (!name) return cookies;

    const rawValue = valueParts.join('=');

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }

    return cookies;
  }, {});
}

function getOdooCookie(request) {
  const cookies = parseCookies(request);
  const sessionId = cookies.session_id || cookies.mrbur_sso;

  if (!sessionId) return null;

  return `session_id=${encodeURIComponent(sessionId)}`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

async function fetchThemeFromOdoo(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  if (!cookieHeader.includes('session_id=')) return null;
  try {
    const res = await fetch(ODOO_THEME_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.ok && data?.authenticated) ? parseTheme(data.theme) : null;
  } catch {
    return null;
  }
}

function buildThemeCookie(theme) {
  return [`${COOKIE_NAME}=${encodeURIComponent(theme)}`, 'Path=/', `Domain=${COOKIE_DOMAIN}`, `Max-Age=${COOKIE_MAX_AGE}`, 'SameSite=Lax', 'Secure'].join('; ');
}

async function handleWalletRequest(request) {
  if (request.method !== 'GET') {
    return jsonResponse(
      {
        ok: false,
        error: 'Method not allowed',
      },
      405
    );
  }

  const odooCookie = getOdooCookie(request);

  if (!odooCookie) {
    return jsonResponse(
      {
        ok: false,
        error: 'Missing Odoo session',
      },
      401
    );
  }

  try {
    const sessionResponse = await fetch(
      `${ODOO_BASE_URL}/web/session/get_session_info`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: odooCookie,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'call',
          params: {},
          id: Date.now(),
        }),
      }
    );

    const sessionData = await sessionResponse
      .json()
      .catch(() => null);

    if (
      !sessionResponse.ok ||
      sessionData?.error ||
      !sessionData?.result
    ) {
      console.error(
        'Odoo session response:',
        sessionData
      );

      return jsonResponse(
        {
          ok: false,
          error: 'Unable to retrieve Odoo session',
        },
        401
      );
    }

    const partnerId =
      sessionData.result.partner_id ||
      sessionData.result.partnerId;

    if (!partnerId) {
      return jsonResponse(
        {
          ok: false,
          error: 'Odoo partner_id was not found',
        },
        404
      );
    }

    const walletResponse = await fetch(
      `${ODOO_BASE_URL}/api/wallet?partner_id=${encodeURIComponent(
        String(partnerId)
      )}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: odooCookie,
        },
      }
    );

    const walletData = await walletResponse
      .json()
      .catch(() => null);

    if (!walletResponse.ok) {
      console.error(
        'Wallet response:',
        walletData
      );

      return jsonResponse(
        {
          ok: false,
          error: 'Unable to retrieve Snabbb Credit balance',
        },
        walletResponse.status || 502
      );
    }

    const rawBalance =
      walletData?.data?.snabbb_balance ??
      walletData?.data?.balance ??
      walletData?.result?.snabbb_balance ??
      walletData?.result?.balance ??
      walletData?.snabbb_balance ??
      walletData?.balance;

    const numericBalance = Number(rawBalance);

    if (!Number.isFinite(numericBalance)) {
      console.error(
        'Unexpected wallet payload:',
        walletData
      );

      return jsonResponse(
        {
          ok: false,
          error: 'Wallet API returned an invalid balance',
        },
        502
      );
    }

    return jsonResponse({
      ok: true,
      partnerId,
      balance: numericBalance,
      data: {
        balance: numericBalance,
        snabbb_balance: numericBalance,
      },
    });
  } catch (error) {
    console.error(
      'Wallet API error:',
      error
    );

    return jsonResponse(
      {
        ok: false,
        error:
          error?.message ||
          'Snabbb Credit service is unavailable',
      },
      500
    );
  }
}

function isHtmlRequest(request) {
  const accept = request.headers.get('Accept') || '';
  if (!accept.includes('text/html')) return false;
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/')) return false;
  if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json|webp|mp3|wav)$/i.test(path)) return false;
  return true;
}

class ThemeInjector {
  constructor(theme) { this.theme = theme; this.done = false; }
  element(el) {
    if (this.done) return;
    this.done = true;
    el.prepend(`<script>window.__SNABBB_THEME__=${JSON.stringify(this.theme)};<\/script>`, { html: true });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/wallet') {
      return handleWalletRequest(request);
    }

    if (!isHtmlRequest(request)) {
      return env.ASSETS.fetch(request);
    }

    const cookieTheme = readThemeCookie(request);
    const hasSession  = (request.headers.get('Cookie') || '').includes('session_id=');

    let odooTheme = null;
    if (!cookieTheme && hasSession) {
      odooTheme = await fetchThemeFromOdoo(request);
    }

    const theme = odooTheme || cookieTheme || DEFAULT_THEME;
    const pageRes = await env.ASSETS.fetch(request);

    if (!pageRes.ok || !pageRes.headers.get('Content-Type')?.includes('text/html')) {
      return pageRes;
    }

    const headers = new Headers(pageRes.headers);
    headers.append('Set-Cookie', buildThemeCookie(theme));

    return new HTMLRewriter()
      .on('head', new ThemeInjector(theme))
      .transform(new Response(pageRes.body, { status: pageRes.status, headers }));
  },
};