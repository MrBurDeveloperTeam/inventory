/**
 * themeSync.js — Snabbb cross-app theme sync for Inventory (DentaStock Pro).
 *
 * Cookie  (Domain=.snabbb.com) — cross-subdomain, instant
 * Odoo   (/api/user/theme)     — cross-device source of truth
 * localStorage['theme']         — this app's own fallback
 */

const COOKIE_NAME    = 'snabbb-theme';
const LS_KEY         = 'theme';
const VALID          = new Set(['light', 'dark', 'system']);
const ENDPOINT       = '/api/user/theme';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// ─── Parse ────────────────────────────────────────────────────────────────────

export function parseTheme(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.startsWith('{')) {
    try {
      const p = JSON.parse(s);
      s = p?.state?.theme || p?.theme || (typeof p === 'string' ? p : s);
    } catch (_) {}
  }
  s = s.trim().toLowerCase();
  return VALID.has(s) ? s : null;
}

export function resolveTheme(theme) {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
           window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

// ─── Cookie ───────────────────────────────────────────────────────────────────

export function readThemeCookie() {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)snabbb-theme=([^;]*)/);
  return m ? parseTheme(decodeURIComponent(m[1])) : null;
}

export function writeThemeCookie(theme) {
  if (typeof document === 'undefined' || !VALID.has(theme)) return;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  const domain = isLocal ? '' : `; Domain=.snabbb.com`;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(theme)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${domain}`;
}

// ─── localStorage ─────────────────────────────────────────────────────────────

export function readStoredTheme() {
  return readThemeCookie()
    || parseTheme(typeof window !== 'undefined' && window.localStorage?.getItem(LS_KEY))
    || null;
}

export function writeStoredTheme(theme) {
  if (typeof window === 'undefined' || !VALID.has(theme)) return;
  try { window.localStorage.setItem(LS_KEY, theme); } catch (_) {}
}

// ─── DOM ──────────────────────────────────────────────────────────────────────

export function applyThemeToDocument(theme) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.dataset.themePreference = theme;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

// ─── Odoo API ─────────────────────────────────────────────────────────────────

let _inFlight = false;

export async function syncThemeFromOdoo(onThemeChange) {
  if (_inFlight) return null;
  _inFlight = true;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !data?.authenticated) return null;

    const odooTheme = parseTheme(data.theme);
    if (!odooTheme) return null;

    const cookieTheme = readThemeCookie();
    if (odooTheme !== cookieTheme) {
      writeThemeCookie(odooTheme);
      writeStoredTheme(odooTheme);
      if (onThemeChange) onThemeChange(odooTheme);
    }
    return odooTheme;
  } catch (_) {
    return null;
  } finally {
    _inFlight = false;
  }
}

export async function pushThemeToOdoo(theme) {
  if (!VALID.has(theme)) return;
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });
  } catch (_) {}
}