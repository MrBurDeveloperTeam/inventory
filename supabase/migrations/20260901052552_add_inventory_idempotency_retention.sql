-- Phase INVENTORY-IDEMPOTENCY-RETENTION-HARDENING
--
-- public.inventory_mutation_idempotency retained rows indefinitely.
-- Every idempotency key in this app is held ONLY in a component-local
-- React useRef (App.tsx's pendingActionKeysRef, InventoryActionConfirm's
-- idempotencyKeyRef, RoomModal's ocrRowKeysRef) — none are persisted to
-- localStorage/sessionStorage/a URL/anywhere durable. A key's entire
-- reachable lifetime therefore ends at the latest when its owning
-- component unmounts or the page reloads, which bounds any legitimate
-- retry to "the same still-open browser tab, before the user closes the
-- dialog or refreshes" — a human-interaction timescale of, at most, tens
-- of minutes. A 24-hour retention window is comfortably (multiple
-- orders of magnitude) longer than that, while still keeping the table
-- from growing unbounded.
--
-- Cleanup is a separate scheduled job, not code inside any mutation RPC
-- — mutation latency stays completely independent of retention. This
-- matches the existing pattern already used in this shared project for
-- expire_pending_appointment_requests (a pg_cron job calling a narrow
-- SECURITY DEFINER maintenance function).

-- Supports the cleanup function's WHERE created_at < ... predicate
-- without a full-table scan as the table grows.
create index if not exists idx_inventory_mutation_idempotency_created_at
  on public.inventory_mutation_idempotency (created_at);

create or replace function public.cleanup_inventory_mutation_idempotency()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.inventory_mutation_idempotency
  where created_at < now() - interval '24 hours';

  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

-- Unlike this project's existing maintenance functions
-- (expire_pending_appointment_requests, send_appointment_reminders),
-- this one is deliberately NOT left callable by anon/authenticated —
-- there is no legitimate client reason to trigger idempotency cleanup,
-- and inventory_mutation_idempotency itself already has zero direct
-- anon/authenticated access (RLS enabled, no policies). pg_cron invokes
-- this as the scheduling role (postgres), which retains EXECUTE via
-- ownership regardless of this revoke.
revoke execute on function public.cleanup_inventory_mutation_idempotency() from public;

select cron.schedule(
  'cleanup-inventory-idempotency',
  '0 * * * *',
  $$select public.cleanup_inventory_mutation_idempotency();$$
);
