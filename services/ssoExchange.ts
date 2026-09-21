import axios from 'axios';
import { supabase } from '../supabaseClient';

// Ported verbatim from the DentalCalculator (Profit Calculator) app's
// lib/odooApi.ts, which is the one mini-app whose SSO auto-login is
// confirmed working. Two things about it matter and are easy to lose in
// translation: (1) no explicit request timeout -- the exchange can take a
// few seconds when the Worker's Supabase-user lookup falls back to
// paginating every Auth user, and an aggressive client timeout (this repo
// previously used 3s, then 10s) just aborts the request before that
// finishes; letting axios use its default (no timeout) is what makes
// calculator's version actually work. (2) the token is sent as an
// Authorization header, not a query param -- withCredentials still carries
// the shared .snabbb.com cookie for the common case (arriving via the
// /sso/login bridge, which sets that cookie before redirecting here).
const API_URL = import.meta.env.VITE_API_BASE_URL || 'https://sso.snabbb.com/api';

export const ssoApi = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

ssoApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err.message;
    const error = new Error(msg) as any;
    error.status = err?.response?.status;
    return Promise.reject(error);
  }
);

/**
 * Contacts the SSO endpoint to retrieve access/refresh tokens and injects
 * them into the Supabase session. Returns true on a successful exchange,
 * false otherwise -- it never throws, so callers can fire-and-forget it.
 */
export async function exchangeSsoToken(): Promise<boolean> {
  try {
    const params = new URLSearchParams(window.location.search);
    // The launch bridge (snabbb-worker's /sso/login) appends the token as
    // sso_token; a manually shared link may use the shorter token= form.
    const token = params.get('sso_token') || params.get('token');
    const sso = await ssoApi.get(
      '/sso/exchange',
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    );
    if (sso?.data?.access_token && sso?.data?.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: sso.data.access_token,
        refresh_token: sso.data.refresh_token,
      });
      if (error) throw error;
      localStorage.setItem('is_sso_session', 'true');
      if (token) {
        const url = new URL(window.location.href);
        url.searchParams.delete('sso_token');
        url.searchParams.delete('token');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
      return true;
    }
  } catch (err: any) {
    console.warn('No active SSO session to exchange.', err.message);
    const { data: sessionData } = await supabase.auth.getSession();

    // If there is an authorization failure and we previously had an SSO session
    if (
      sessionData.session &&
      (err.status === 401 || err.status === 403 || err.status === 404) &&
      localStorage.getItem('is_sso_session') === 'true'
    ) {
      await supabase.auth.signOut();
      localStorage.removeItem('is_sso_session');
    }
    return false;
  }
  return false;
}
