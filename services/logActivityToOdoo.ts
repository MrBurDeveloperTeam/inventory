import type { ActivityLog } from '../types';

/**
 * Pushes a single inventory activity event to Odoo via the app's own
 * Cloudflare Pages Worker (public/_worker.js -> POST /api/activity), which
 * resolves the caller's Odoo partner_id server-side from their session
 * cookie and forwards the event to Odoo. Same-origin, cookie-authenticated —
 * mirrors the existing /api/wallet route in that same worker file.
 *
 * This call is best-effort: activity logging must never block the UI or
 * fail the local (Supabase) audit trail, so callers should fire-and-forget
 * it and swallow/log errors rather than await + throw.
 *
 * See ACTIVITY_TRACKER_ODOO_SYNC.md for the full contract and the Odoo-side
 * work that still needs to happen (ODOO_ACTIVITY_URL in _worker.js).
 */

const ACTIVITY_ENDPOINT = '/api/activity';

export interface ActivityOdooPayload {
  app_code: 'inventory';
  external_ref: string;       // idempotency key so retries don't double-log in Odoo
  supabase_user_id: string | null;
  actor_name: string | null;
  action: ActivityLog['action'];
  room_id: string;
  room_name: string;
  details: string;
  before_value?: string | null;
  after_value?: string | null;
  occurred_at: string;        // ISO timestamp
}

export async function logActivityToOdoo(params: {
  logId: string;
  supabaseUserId: string | null;
  actorName: string | null;
  action: ActivityLog['action'];
  roomId: string;
  roomName: string;
  details: string;
  beforeValue?: string | null;
  afterValue?: string | null;
  occurredAt: string;
}): Promise<boolean> {
  const payload: ActivityOdooPayload = {
    app_code: 'inventory',
    external_ref: `activity-${params.logId}`,
    supabase_user_id: params.supabaseUserId,
    actor_name: params.actorName,
    action: params.action,
    room_id: params.roomId,
    room_name: params.roomName,
    details: params.details,
    before_value: params.beforeValue ?? null,
    after_value: params.afterValue ?? null,
    occurred_at: params.occurredAt,
  };

  try {
    const res = await fetch(ACTIVITY_ENDPOINT, {
      method: 'POST',
      credentials: 'include', // send the Odoo session cookie the worker reads
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) {
      console.error('Failed to sync activity to Odoo:', data?.error || res.status);
      return false;
    }
    return true;
  } catch (err: any) {
    // Best-effort: Odoo/worker being unreachable should never break local activity logging.
    console.error('Failed to sync activity to Odoo:', err?.message || err);
    return false;
  }
}
