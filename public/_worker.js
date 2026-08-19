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
const ODOO_ACCOUNT_BASE_URL = 'https://account.snabbb.com';
const ODOO_THEME_URL = 'https://mrbur.odoo.com/api/user/theme';
// Odoo-side controller that persists one inventory activity event. Source
// for this controller lives in odoo_addon/inventory_activity_log/ (this
// repo) — it must be installed on the mrbur.odoo.com database before this
// URL will work. See ACTIVITY_TRACKER_ODOO_SYNC.md for install steps.
const ODOO_ACTIVITY_URL = 'https://mrbur.odoo.com/api/inventory/activity';
const ACTIVITY_ACTIONS = new Set(['add', 'remove', 'delete', 'transfer_out', 'transfer_in', 'edit', 'receive', 'session_end', 'page_view']);
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

/**
 * Resolves the Odoo partner_id (and raw session result) for the session_id/mrbur_sso
 * cookie already forwarded by the browser. Shared by handleWalletRequest and
 * handleActivityRequest so both trust the server-side Odoo session rather than
 * any partner_id the client might claim to be.
 *
 * Returns { ok: true, partnerId, session } or { ok: false, status, error }.
 */
async function resolveOdooSession(odooCookie) {
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
      console.error('Odoo session response:', sessionData);
      return { ok: false, status: 401, error: 'Unable to retrieve Odoo session' };
    }

    const partnerId =
      sessionData.result.partner_id ||
      sessionData.result.partnerId;

    if (!partnerId) {
      return { ok: false, status: 404, error: 'Odoo partner_id was not found' };
    }

    return { ok: true, partnerId, session: sessionData.result };
  } catch (error) {
    console.error('Odoo session lookup error:', error);
    return { ok: false, status: 500, error: error?.message || 'Odoo session service is unavailable' };
  }
}

async function handleProfileAvatarRequest(request) {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const odooCookie = getOdooCookie(request);

  if (!odooCookie) {
    return jsonResponse({ ok: false, error: 'Missing Odoo session' }, 401);
  }

  try {
    // Keep this aligned with the main app's useProfileImage hook. The account
    // service owns the partner profile/image; mrbur.odoo.com is used by other
    // inventory integrations but is not the source of truth for this avatar.
    const profileResponse = await fetch(
      `${ODOO_ACCOUNT_BASE_URL}/api/account/profile`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Cookie: odooCookie,
        },
        redirect: 'manual',
      }
    );
    const profile = await profileResponse.json().catch(() => null);
    const partnerId = profile?.partner_id;
    console.log('partnerId', partnerId);
    const hasImage = profile?.partner?.has_image;

    if (!profileResponse.ok || !profile?.ok || !partnerId || hasImage === false) {
      return jsonResponse(
        { ok: false, error: 'Profile picture was not found' },
        404
      );
    }

    const avatarResponse = await fetch(
      `${ODOO_ACCOUNT_BASE_URL}/web/image/res.partner/` +
        `${encodeURIComponent(String(partnerId))}/image_128`,
      {
        method: 'GET',
        headers: {
          Accept: 'image/*',
          Cookie: odooCookie,
        },
        redirect: 'manual',
      }
    );
    const contentType = avatarResponse.headers.get('Content-Type') || '';

    // Odoo may redirect to a login page when the shared session is invalid.
    if (!avatarResponse.ok || !contentType.startsWith('image/')) {
      return jsonResponse(
        { ok: false, error: 'Profile picture was not found' },
        404
      );
    }

    return new Response(avatarResponse.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Account avatar lookup error:', error);
    return jsonResponse(
      { ok: false, error: 'Profile picture service is unavailable' },
      502
    );
  }
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
    const sessionResult = await resolveOdooSession(odooCookie);
    if (!sessionResult.ok) {
      return jsonResponse({ ok: false, error: sessionResult.error }, sessionResult.status);
    }
    const { partnerId } = sessionResult;

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

/**
 * POST /api/activity
 *
 * Receives one inventory activity event from the app (see
 * services/logActivityToOdoo.ts), resolves the caller's Odoo partner_id
 * server-side from their session cookie (never trusts a client-supplied
 * partner_id), and forwards the event to Odoo to be persisted.
 *
 * This endpoint is best-effort from the app's point of view: it should
 * always return quickly and never throw uncaught, since a failed sync must
 * not affect the app's local (Supabase) activity log, which remains the
 * source of truth in the UI.
 *
 * Expected request body:
 * {
 *   app_code: "inventory",
 *   external_ref: "activity-<uuid>",   // idempotency key, forwarded as-is to Odoo
 *   supabase_user_id: string | null,
 *   actor_name: string | null,
 *   action: "add"|"remove"|"delete"|"transfer_out"|"transfer_in"|"edit"|"receive",
 *   room_id: string,
 *   room_name: string,
 *   details: string,
 *   before_value: string | null,
 *   after_value: string | null,
 *   occurred_at: string (ISO timestamp)
 * }
 */
async function handleActivityRequest(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const odooCookie = getOdooCookie(request);
  if (!odooCookie) {
    return jsonResponse({ ok: false, error: 'Missing Odoo session' }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const {
    external_ref,
    supabase_user_id = null,
    actor_name = null,
    action,
    room_id,
    room_name,
    details,
    before_value = null,
    after_value = null,
    occurred_at,
    session_duration_seconds = 0,
  } = body;

  if (!external_ref || !action || !details || !occurred_at) {
    return jsonResponse(
      { ok: false, error: 'Missing required field(s): external_ref, action, room_id, details, occurred_at' },
      400
    );
  }

  // room_id is required for all actions except session_end
  if (action !== 'session_end' && !room_id) {
    return jsonResponse({ ok: false, error: 'Missing required field: room_id' }, 400);
  }

  if (!ACTIVITY_ACTIONS.has(action)) {
    return jsonResponse({ ok: false, error: `Unknown action "${action}"` }, 400);
  }

  const sessionResult = await resolveOdooSession(odooCookie);
  if (!sessionResult.ok) {
    return jsonResponse({ ok: false, error: sessionResult.error }, sessionResult.status);
  }
  const { partnerId, session } = sessionResult;

  try {
    const odooResponse = await fetch(ODOO_ACTIVITY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: odooCookie,
      },
      body: JSON.stringify({
        app_code: 'inventory',
        external_ref,
        odoo_partner_id: partnerId,
        odoo_company_id: session?.company_id || null,
        supabase_user_id,
        actor_name,
        action,
        room_id: room_id || null,
        room_name: room_name || null,
        details,
        before_value,
        after_value,
        occurred_at,
        session_duration_seconds,
      }),
    });

    const odooData = await odooResponse.json().catch(() => null);

    if (!odooResponse.ok || odooData?.ok === false) {
      console.error('Activity sync to Odoo failed:', odooData);
      return jsonResponse(
        { ok: false, error: odooData?.error || 'Odoo rejected the activity event' },
        odooResponse.status || 502
      );
    }

    return jsonResponse({ ok: true, external_ref });
  } catch (error) {
    console.error('Activity sync error:', error);
    return jsonResponse(
      { ok: false, error: error?.message || 'Activity sync service is unavailable' },
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

    if (url.pathname === '/api/profile-avatar') {
      return handleProfileAvatarRequest(request);
    }

    if (url.pathname === '/api/activity') {
      return handleActivityRequest(request);
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
