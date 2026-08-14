# Activity Tracker → Odoo Sync

## What changed
Every inventory activity event (add / remove / delete / transfer_in / transfer_out / edit / receive)
already goes through a single choke point: `addActivity()` in `App.tsx`. It previously only wrote
to Supabase (`inventory_activity_logs`). It now also fires a best-effort sync to Odoo.

## The real architecture (important — read this before touching `public/_worker.js`)

`inventory.snabbb.com/api/*` is bound by a **Cloudflare Workers Route** to a separate, shared
worker called **`snabbb-worker`** — the same worker that answers `/api/*` for `app.snabbb.com`,
`appointment.snabbb.com`, `e-learning.snabbb.com`, `todo.snabbb.com`, etc. Workers Routes take
priority over a Pages project's own `_worker.js`. That means:

- **`public/_worker.js`'s `/api/wallet` and `/api/activity` handlers in this repo are dead code
  for this domain.** They never run. The theme-injection logic in that same file (for HTML page
  requests) still works, since Workers Routes only intercept `/api/*`.
- The actual backend logic lives in `snabbb-worker`, which is **not in this repo** — it's a
  separate Cloudflare Worker (dashboard-managed or a different git repo; ask whoever manages
  Workers & Pages for `snabbb.com`).
- `snabbb-worker`'s auth model is different from what an Odoo-session-cookie approach would use:
  it calls Odoo with a static `X-Snabbb-Api-Key` header (`env.SNABBB_API_KEY`) and identifies the
  caller **by email**, not by partner_id or session. This is the same pattern its existing
  `/api/wallet` handler uses (`GET https://mrbur.odoo.com/snabbb/reward/api/wallet/my?email=...`).

So the sync now has three pieces:

1. **`services/logActivityToOdoo.ts`** (client, in this repo) — called from `addActivity()`,
   fire-and-forget. POSTs to same-origin `/api/inventory/activity` (not `/api/activity` — see
   "Route collision" below) with the event plus the current user's `actor_email` (needed for Odoo
   to resolve who this is — no session cookie involved).
2. **`SNABBB_WORKER_activity_route.js`** (this repo, but **not part of the build** — it's a
   snippet to manually paste into the actual `snabbb-worker` script, next to its existing
   `/api/wallet` handler). It forwards the event to Odoo with `X-Snabbb-Api-Key`, mirroring the
   wallet handler's style exactly (same `corsHeaders`, same `env`, reuses the existing
   `resolveWebsiteScope` helper already defined in that file).
3. **`odoo_addon/inventory_activity_log/`** (this repo) — the Odoo module. `controllers/main.py`
   now validates `X-Snabbb-Api-Key` (via `ir.config_parameter` "snabbb.api_key" — **align this
   with however the existing wallet controller checks the key**, see TODO in the file) and
   resolves `res.partner` by email instead of by session uid.

## Route collision (the actual cause of the persistent 401)

`snabbb-worker`'s main entry file already has a **different, unrelated route at `/api/activity`**
— it belongs to a separate clinic/appointment-booking feature on the same worker
(`getActivity`/`addActivity` from `./supabase/activity.js`, keyed by `clinicId`), and requires an
`Authorization: Bearer <JWT>` header. Since `if (url.pathname === ...)` blocks are matched
top-to-bottom and that block is registered long before any inventory-specific code, every request
to `/api/activity` from the inventory app was being caught by that earlier handler first — which,
seeing no `Authorization` header, returned `new Response("Unauthorized", { status: 401 })`. That's
a plain 12-byte string response, which is exactly what showed up in the Network tab regardless of
any ordering/const fixes made to the inventory-specific code further down the file.

Fix: the inventory activity route uses **`/api/inventory/activity`** instead, matching this same
file's existing convention for inventory-specific paths (`/api/inventory/sync`,
`/api/inventory/meta`, `/api/inventory/rooms`, `/api/inventory/register`, etc.) — there's no
collision on that path.

## Request/response shapes

Client → `snabbb-worker`, `POST /api/inventory/activity` (same-origin on `inventory.snabbb.com`):
```json
{
  "external_ref": "activity-<uuid>",
  "actor_email": "user@example.com",
  "actor_name": "Jane Doe",
  "supabase_user_id": "uuid | null",
  "action": "add",
  "room_id": "uuid",
  "room_name": "Storage Room",
  "details": "Added 10 pcs of Gauze",
  "before_value": null,
  "after_value": null,
  "occurred_at": "2026-08-07T12:00:00.000Z"
}
```

`snabbb-worker` → Odoo, `POST https://mrbur.odoo.com/snabbb/api/inventory/activity`
(`ODOO_ACTIVITY_URL` in `SNABBB_WORKER_activity_route.js` — **placeholder, confirm/replace**):
same body renamed to `email` (not `actor_email`), plus `website_scope` (defaults to `"MMY"`,
same correction logic as wallet's `MIN`→`MID`), with `X-Snabbb-Api-Key: env.SNABBB_API_KEY`.

Response back to client: `{ ok: true, external_ref }` on success, `{ ok: false, error }` otherwise.

## Odoo module: `odoo_addon/inventory_activity_log/`

Unchanged model/views from before; controller now:
- Requires `X-Snabbb-Api-Key` header matching the existing `snabbb_reward.api_key` system
  parameter (Settings → Technical → System Parameters) — the same one the reward/wallet API
  already validates against — 401 JSON otherwise. (Note: the reward system also has a
  `snabbb_reward.require_api_key` toggle, currently `0`, that can disable its own key check
  entirely; this controller has its own `REQUIRE_API_KEY = True` constant and ignores that
  toggle, so it always enforces the key regardless of the reward system's setting.)
- Looks up `res.partner` by the `email` field in the body (`search([('email', '=ilike', email)])`).
  If no match, the event is still logged (with `partner_id` empty) rather than rejected — best
  effort, matching the "never block activity logging" principle.
- Idempotent on `external_ref`, same as before.

### Install steps
1. Copy `odoo_addon/inventory_activity_log/` into your Odoo `addons_path`.
2. Confirm `snabbb_reward.api_key` (Settings → Technical → System Parameters) matches the
   `SNABBB_API_KEY` variable on the `snabbb-worker` Cloudflare Worker — it already should, since
   both back the existing reward/wallet API.
3. Restart Odoo, Apps → Update Apps List, install "Inventory Activity Log (Snabbb)".
4. Paste `SNABBB_WORKER_activity_route.js`'s contents into the actual `snabbb-worker` script
   (Cloudflare dashboard Quick Edit or its git repo — wherever `/api/wallet` lives), next to the
   existing wallet handler.
5. Deploy `snabbb-worker`. Test: trigger an inventory activity in the app, check Network tab for
   `POST /api/inventory/activity` returning `{ ok: true }`, then confirm a row landed in
   Settings → Technical → Inventory Activity Log → Activity Events in Odoo.

## Still needed / not done here
- Confirming the real `ODOO_ACTIVITY_URL` path on the Odoo side (currently a placeholder guess,
  `/snabbb/api/inventory/activity`) and the API key validation approach.
- Pasting `SNABBB_WORKER_activity_route.js` into the actual `snabbb-worker` source and deploying
  it — that worker's source isn't in this repo.
- Installing the Odoo module (source is ready, not yet installed anywhere with this auth model).
- Optional cleanup: the dead `/api/wallet` and `/api/activity` handlers (and the now-unused
  `resolveOdooSession` helper) in `public/_worker.js` could be removed to avoid future confusion,
  since Workers Routes mean they never execute for this domain. Left in place for now in case
  they're useful reference or run on a different route than assumed.

## If the contract needs to change
- Client shape/endpoint: `services/logActivityToOdoo.ts`.
- Worker-side forwarding logic: `SNABBB_WORKER_activity_route.js` (then re-paste into the real
  `snabbb-worker` script).
- Odoo model/fields: `odoo_addon/inventory_activity_log/models/inventory_activity_log.py`.
- Odoo controller/auth/validation: `odoo_addon/inventory_activity_log/controllers/main.py`.
`App.tsx`'s `addActivity()` doesn't need to change for any of the above.
