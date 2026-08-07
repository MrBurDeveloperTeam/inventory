# Activity Tracker → Odoo Sync

## What changed
Every inventory activity event (add / remove / delete / transfer_in / transfer_out / edit / receive)
already goes through a single choke point: `addActivity()` in `App.tsx`. It previously only wrote
to Supabase (`inventory_activity_logs`). It now also fires a best-effort sync to Odoo.

Three pieces:

1. **`services/logActivityToOdoo.ts`** (client) — called from `addActivity()`, fire-and-forget.
   POSTs the event to the app's own same-origin endpoint, `/api/activity`, with
   `credentials: 'include'` so the Odoo session cookie rides along.
2. **`public/_worker.js`** (Cloudflare Pages Worker, deployed with this app) — new route
   `POST /api/activity` (`handleActivityRequest`), added next to the existing `/api/wallet` route.
   It reads the forwarded `session_id`/`mrbur_sso` cookie, resolves the caller's Odoo `partner_id`
   server-side via `/web/session/get_session_info` (refactored into a shared `resolveOdooSession()`
   helper also used by `handleWalletRequest`), then forwards the event to Odoo.
3. **Odoo-side controller** — **not implemented**, see "Still needed" below.

This mirrors the existing `/api/wallet` pattern in the same worker file rather than the separate
API-key-based Snabbb host (`VITE_ODOO_BASE_URL` / `X-Snabbb-Api-Key`) used by
`consumeGameCredit.ts` / `useWallet.ts` — same-origin + cookie auth, no client-supplied partner_id
to trust.

## Request/response shapes

Client → Worker, `POST /api/activity`:
```json
{
  "app_code": "inventory",
  "external_ref": "activity-<uuid>",
  "supabase_user_id": "uuid | null",
  "actor_name": "Jane Doe",
  "action": "add",
  "room_id": "uuid",
  "room_name": "Storage Room",
  "details": "Added 10 pcs of Gauze",
  "before_value": null,
  "after_value": null,
  "occurred_at": "2026-08-07T12:00:00.000Z"
}
```

Worker → Odoo, `POST ODOO_ACTIVITY_URL` (constant in `public/_worker.js`, currently a placeholder:
`https://mrbur.odoo.com/api/inventory/activity`): same body, plus `odoo_partner_id` and
`odoo_company_id` resolved server-side from the session — never trusts a client-supplied partner id.

Worker → Client response: `{ ok: true, external_ref }` on success, `{ ok: false, error }` otherwise
(401 no session, 400 bad body, 502 Odoo rejected it, 500 unexpected).

## Still needed (out of scope here)
- **The Odoo controller itself.** `ODOO_ACTIVITY_URL` in `public/_worker.js` is a guess
  (`/api/inventory/activity`) matching the naming of the existing `/api/wallet` Odoo controller.
  Point it at the real route once you've added it, e.g. a controller that creates one record per
  event in a custom model (`x_inventory_activity_log`, or logged onto the partner via
  `mail.message`), keyed by `external_ref` so retries don't create duplicates.
- **Deploy**: this worker change lives in `public/_worker.js` in this repo — upload/redeploy it to
  Cloudflare Pages as usual.
- No retry/backoff or outbox for failed syncs — best-effort only. If you need guaranteed delivery,
  consider an `odoo_synced_at` column on `inventory_activity_logs` plus a periodic retry job.

## If the contract needs to change
- Client shape/endpoint: edit `services/logActivityToOdoo.ts`.
- Worker routing/session handling: edit `handleActivityRequest` in `public/_worker.js`.
- Odoo target URL: edit `ODOO_ACTIVITY_URL` in `public/_worker.js`.
`App.tsx`'s `addActivity()` doesn't need to change for any of the above.
