import { useEffect, useState } from 'react';

/**
 * Display name of the signed-in user, read from Odoo's get_session_info —
 * the same source the App Gallery (app.snabbb.com) uses for its own header
 * and welcome message — so every Snabbb app shows the same name.
 *
 * The Odoo session cookie is shared across *.snabbb.com and the gallery's
 * worker answers cross-origin credentialed POSTs, so this needs no
 * app-specific backend. Callers pass the email of the account the app has
 * signed in; the name is only used when the Odoo session belongs to that
 * same account, so a stale cookie can never show someone else's name.
 */
const SESSION_INFO_URL = 'https://app.snabbb.com/api/web/session/get_session_info';

interface OdooSessionIdentity {
  name: string | null;
  login: string | null;
}

let inFlight: Promise<OdooSessionIdentity> | null = null;

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

// Concurrent callers share one request; nothing is cached after it settles.
function requestSessionIdentity(): Promise<OdooSessionIdentity> {
  if (inFlight) return inFlight;
  const request: Promise<OdooSessionIdentity> = fetch(SESSION_INFO_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {}, id: 1 }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data): OdooSessionIdentity => ({
      name: asText(data?.result?.name),
      login: asText(data?.result?.username)?.toLowerCase() ?? null,
    }))
    .catch((): OdooSessionIdentity => ({ name: null, login: null }))
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
  return request;
}

/** Odoo `name` for the current session, or null if unavailable / different account. */
export async function fetchOdooSessionName(expectedEmail?: string | null): Promise<string | null> {
  const { name, login } = await requestSessionIdentity();
  if (!name) return null;
  const expected = expectedEmail?.trim().toLowerCase();
  if (expected && login && login !== expected) return null;
  return name;
}

/**
 * React hook form of fetchOdooSessionName. Returns null until the name is
 * known (callers fall back to their existing name), and re-fetches when the
 * signed-in account changes.
 */
export function useOdooSessionName(enabled: boolean, expectedEmail?: string | null): string | null {
  const key = (expectedEmail ?? '').trim().toLowerCase();
  const [result, setResult] = useState<{ key: string; name: string } | null>(null);

  useEffect(() => {
    if (!enabled || !key) {
      setResult(null);
      return;
    }
    let cancelled = false;
    void fetchOdooSessionName(key).then((name) => {
      if (!cancelled) setResult(name ? { key, name } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  return result && result.key === key ? result.name : null;
}
