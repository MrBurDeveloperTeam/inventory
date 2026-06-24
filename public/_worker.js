/**
 * _worker.js — Cloudflare Pages Worker for inventory.snabbb.com
 *
 * Intercepts HTML requests, fetches the user's theme from Odoo server-side,
 * and injects window.__SNABBB_THEME__ into <head> before the browser sees it.
 * Zero flash. No cookie dependency on first load.
 *
 * Place at: public/_worker.js
 */

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
    if (!isHtmlRequest(request)) return env.ASSETS.fetch(request);

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