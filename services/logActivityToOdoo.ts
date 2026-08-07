import type { ActivityLog } from '../types';

/**
 * Pushes a single inventory activity event to Odoo via the `snabbb-worker`
 * Cloudflare Worker — the one actually bound to the Workers Route
 * `inventory.snabbb.com/api/*` (see SNABBB_WORKER_activity_route.js at the
 * repo root for the worker-side code, and ACTIVITY_TRACKER_ODOO_SYNC.md for
 * the full contract). That worker, not public/_worker.js in this repo, is
 * what actually answers this call.
 *
 * Auth model: unlike an Odoo-session-cookie approach, this worker identifies
 * the caller by email and authenticates to Odoo itself via a static
 * X-Snabbb-Api-Key — the same pattern already used for /api/wallet. So this
 * client call doesn't need `credentials: 'include'`; it just needs to know
 * the current user's email.
 *
 * This call is best-effort: activity logging must never block the UI or
 * fail the local (Supabase) audit trail, so callers should fire-and-forget
 * it and swallow/log errors rather than await + throw.
 */

const ACTIVITY_ENDPOINT = '/api/activity';

export interface ActivityOdooPayload {
  external_ref: string;       // idempotency key so retries don't double-log in Odoo
  actor_email: string | null; // used by snabbb-worker/Odoo to resolve the partner
  actor_name: string | null;
  supabase_user_id: string | null;
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
  actorEmail: string | null;
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
  if (!params.actorEmail) {
    // Nothing to resolve the Odoo partner by — skip rather than send a
    // request we know the backend will reject.
    console.warn('Skipping Odoo activity sync: no actor email available.');
    return false;
  }

  const payload: ActivityOdooPayload = {
    external_ref: `activity-${params.logId}`,
    actor_email: params.actorEmail,
    actor_name: params.actorName,
    supabase_user_id: params.supabaseUserId,
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
    // Best-effort: the worker/Odoo being unreachable should never break local activity logging.
    console.error('Failed to sync activity to Odoo:', err?.message || err);
    return false;
  }
}
