-- Phase INVENTORY-DIRECT-MUTATION-RELIABILITY-HARDENING
--
-- Audited every direct Inventory mutation not already covered by
-- transfer_inventory_stock / receive_inventory_stock. Of those,
-- updateItemQty and updateItemBatchQty (App.tsx) stood out as the one
-- pair that combines every risk factor the phase asks to weigh:
--   - DELTA-based (quantity = current + delta), so a retry of the same
--     request applies the adjustment a second time -- unlike an
--     absolute SET, this is genuinely non-idempotent.
--   - READ-MODIFY-WRITE computed entirely from this client's own
--     (possibly stale) `rooms` React state (adjustBatchesWithDelta
--     reads `item.batches` from local state, never a locked DB read).
--   - MULTI-TABLE (inventory_items + inventory_item_batches) via
--     several sequential, non-transactional awaited calls.
--   - Errors were caught but never re-thrown (`console.error` only),
--     so a caller `await`ing either function could never distinguish
--     a failed save from a successful one -- worse than every other
--     mutation path in this codebase, all of which already surface
--     failures.
--
-- Other direct paths were audited and judged NOT to need this:
--   - updateItemMetadata: merges an itemData Partial<Item> as an
--     absolute SET (not a delta) and derives batches[0] deterministically
--     from that same payload -- retrying with the same payload converges
--     to the same state. Naturally idempotent in effect.
--   - updateBatchMetadata: also an absolute SET on the target batch;
--     the item-summary recompute does read the client's cached sibling
--     batches (a real, but narrower, staleness risk), tracked as a new
--     backlog rather than fixed here (see final report).
--   - deleteItem: DELETE cascades to inventory_item_batches via an
--     existing ON DELETE CASCADE FK (confirmed live), and its one other
--     write (archiving purchase-history rows) is itself an idempotent
--     absolute SET -- a retry after a partial failure re-applies two
--     already-idempotent operations, so no RPC is needed structurally.
--   - updateRoomName: a single-column absolute SET, RLS-protected,
--     naturally idempotent.
--
-- This migration adds ONE RPC, adjust_inventory_item_quantity, covering
-- both updateItemQty (p_batch_id = null: apply delta using the exact
-- same batch-selection rule as the client's adjustBatchesWithDelta --
-- positive delta always goes to the earliest-created batch, creating
-- one if none exist; negative delta is taken from the most-recently-
-- created batch(es) backward, deleting any batch it exhausts) and
-- updateItemBatchQty (p_batch_id set: apply delta to that one batch,
-- clamped at zero, deleting it if exhausted) -- one function, two
-- modes, exactly mirroring how transfer_inventory_stock's
-- p_source_batch_id already distinguishes "targeted batch" from
-- "whole-item" behavior.
--
-- Reuses the existing inventory_mutation_idempotency table/claim
-- pattern (new operation_type 'adjust_quantity') rather than building a
-- second framework -- this delta mutation is exactly the case durable
-- idempotency exists for.

begin;

alter table public.inventory_mutation_idempotency
  drop constraint inventory_mutation_idempotency_operation_type_check;
alter table public.inventory_mutation_idempotency
  add constraint inventory_mutation_idempotency_operation_type_check
  check (operation_type in ('transfer', 'receive', 'adjust_quantity'));

create function public.adjust_inventory_item_quantity(
  p_item_id uuid,
  p_delta numeric,
  p_idempotency_key uuid,
  p_batch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_owner_id uuid;
  v_item record;
  v_batch record;
  v_new_qty numeric;
  v_final_qty numeric;
  v_final_price numeric;
  v_final_expiry date;
  v_fingerprint text;
  v_claim_id uuid;
  v_existing_claim record;
  v_response jsonb;
  v_remaining numeric;
  v_take numeric;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_delta is null or p_delta = 0 or p_delta = 'NaN'::numeric then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  v_fingerprint := md5(concat_ws('|', p_item_id::text, p_delta::text, coalesce(p_batch_id::text, '')));

  insert into public.inventory_mutation_idempotency (user_id, operation_type, idempotency_key, request_fingerprint)
  values (v_caller_id, 'adjust_quantity', p_idempotency_key, v_fingerprint)
  on conflict (user_id, operation_type, idempotency_key) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    select * into v_existing_claim
    from public.inventory_mutation_idempotency
    where user_id = v_caller_id and operation_type = 'adjust_quantity' and idempotency_key = p_idempotency_key;

    if v_existing_claim.request_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;

    return v_existing_claim.response_payload;
  end if;

  select * into v_item
  from public.inventory_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'INVALID_ITEM' using errcode = 'P0002';
  end if;

  v_owner_id := v_item.user_id;

  if v_caller_id <> v_owner_id and not exists (
    select 1 from public.collaborators
    where collaborators.user_id = v_caller_id
      and collaborators.owner_id = v_owner_id
      and collaborators.role in ('editor', 'admin')
  ) then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  if p_batch_id is not null then
    -- Targeted-batch mode (updateItemBatchQty): lock every batch on
    -- this item so the item-summary recompute below is consistent, but
    -- only the targeted one is mutated.
    perform 1 from public.inventory_item_batches where item_id = p_item_id for update;

    select * into v_batch
    from public.inventory_item_batches
    where id = p_batch_id and item_id = p_item_id;

    if not found then
      raise exception 'INVALID_BATCH' using errcode = 'P0002';
    end if;

    v_new_qty := greatest(v_batch.qty + p_delta, 0);
    if v_new_qty <= 0 then
      delete from public.inventory_item_batches where id = p_batch_id;
    else
      update public.inventory_item_batches set qty = v_new_qty where id = p_batch_id;
    end if;
  else
    -- Whole-item mode (updateItemQty): reproduces adjustBatchesWithDelta
    -- exactly. Lock all batches first so both branches operate on a
    -- consistent, DB-authoritative snapshot.
    perform 1 from public.inventory_item_batches where item_id = p_item_id for update;

    if p_delta > 0 then
      select * into v_batch
      from public.inventory_item_batches
      where item_id = p_item_id
      order by created_at asc, id asc
      limit 1;

      if found then
        update public.inventory_item_batches set qty = v_batch.qty + p_delta where id = v_batch.id;
      else
        insert into public.inventory_item_batches (id, item_id, qty, unit_price, expiry_date)
        values (gen_random_uuid(), p_item_id, p_delta, v_item.price, v_item.expiry_date);
      end if;
    else
      v_remaining := abs(p_delta);
      for v_batch in
        select * from public.inventory_item_batches
        where item_id = p_item_id
        order by created_at desc, id desc
      loop
        exit when v_remaining <= 0;
        v_take := least(v_batch.qty, v_remaining);
        if v_take > 0 then
          v_new_qty := v_batch.qty - v_take;
          if v_new_qty <= 0 then
            delete from public.inventory_item_batches where id = v_batch.id;
          else
            update public.inventory_item_batches set qty = v_new_qty where id = v_batch.id;
          end if;
          v_remaining := v_remaining - v_take;
        end if;
      end loop;
    end if;
  end if;

  -- Recompute the item summary from its actual, now-authoritative
  -- batch set — never from client-supplied totals.
  select
    coalesce(sum(qty), 0),
    coalesce(case when sum(qty) > 0 then sum(qty * unit_price) / sum(qty) else 0 end, 0),
    min(expiry_date)
  into v_final_qty, v_final_price, v_final_expiry
  from public.inventory_item_batches
  where item_id = p_item_id;

  update public.inventory_items
  set quantity = v_final_qty, price = v_final_price, expiry_date = v_final_expiry
  where id = p_item_id;

  v_response := jsonb_build_object(
    'item_id', p_item_id,
    'quantity', v_final_qty,
    'price', v_final_price,
    'expiry_date', v_final_expiry
  );

  update public.inventory_mutation_idempotency
  set response_payload = v_response
  where id = v_claim_id;

  return v_response;
end;
$$;

revoke all on function public.adjust_inventory_item_quantity(uuid, numeric, uuid, uuid) from public;
revoke all on function public.adjust_inventory_item_quantity(uuid, numeric, uuid, uuid) from anon;
grant execute on function public.adjust_inventory_item_quantity(uuid, numeric, uuid, uuid) to authenticated;

commit;
