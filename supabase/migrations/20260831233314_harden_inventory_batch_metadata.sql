-- Phase INVENTORY-BATCH-METADATA-STALE-RECOMPUTE-HARDENING
--
-- Closes INVENTORY_BATCH_METADATA_STALE_RECOMPUTE_BACKLOG.
--
-- updateBatchMetadata (App.tsx) is the "Edit Batch" form's save handler
-- (shared with the receive-into-existing-batch edit path). It patches
-- one target batch's qty/unitPrice/expiryDate, then recomputes the
-- parent item's quantity/price/expiry_date by summing ALL of the item's
-- batches — but that sum is computed from this client's own cached
-- `item.batches` React state, not a fresh database read. If a sibling
-- batch was changed by a concurrent writer (another tab, another user,
-- a transfer, a receive) after this client's state was last loaded, the
-- parent item write here silently reverts that sibling's contribution
-- to the summary back to its stale value — while the sibling batch row
-- itself is untouched, so inventory_items and inventory_item_batches
-- diverge.
--
-- All three batch fields (qty, unit_price, expiry_date) are
-- summary-affecting; there is no non-summary-affecting batch field.
-- The client's "Edit Batch" form always submits all three together as
-- a complete SET (never a true partial patch), so this RPC matches
-- that exactly rather than inventing optional-patch semantics nothing
-- currently exercises — notably, expiry_date legitimately needs to be
-- settable to NULL ("no expiry"), which would be ambiguous under a
-- NULL-means-"don't change" convention.
--
-- Lock order matches adjust_inventory_item_quantity exactly (item row
-- first, then all of its batches) so the two RPCs can never deadlock
-- against each other on the same item — whichever call reaches the
-- item lock first simply serializes the other behind it.

create function public.update_inventory_batch_metadata(
  p_batch_id uuid,
  p_qty numeric,
  p_unit_price numeric,
  p_expiry_date date,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_owner_id uuid;
  v_item_id uuid;
  v_item record;
  v_batch record;
  v_final_qty numeric;
  v_final_price numeric;
  v_final_expiry date;
  v_fingerprint text;
  v_claim_id uuid;
  v_existing_claim record;
  v_response jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_qty is null or p_qty < 0 or p_qty = 'NaN'::numeric then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  if p_unit_price is null or p_unit_price < 0 or p_unit_price = 'NaN'::numeric then
    raise exception 'INVALID_PRICE' using errcode = '22023';
  end if;

  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  -- Resolve item_id from the batch itself before any lock, purely to
  -- build the fingerprint/claim — the actual authoritative item_id used
  -- for every subsequent step is re-read from the locked row below.
  select item_id into v_item_id from public.inventory_item_batches where id = p_batch_id;
  if v_item_id is null then
    raise exception 'INVALID_BATCH' using errcode = 'P0002';
  end if;

  v_fingerprint := md5(concat_ws('|', p_batch_id::text, p_qty::text, p_unit_price::text, coalesce(p_expiry_date::text, '')));

  insert into public.inventory_mutation_idempotency (user_id, operation_type, idempotency_key, request_fingerprint)
  values (v_caller_id, 'batch_metadata', p_idempotency_key, v_fingerprint)
  on conflict (user_id, operation_type, idempotency_key) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    select * into v_existing_claim
    from public.inventory_mutation_idempotency
    where user_id = v_caller_id and operation_type = 'batch_metadata' and idempotency_key = p_idempotency_key;

    if v_existing_claim.request_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;

    return v_existing_claim.response_payload;
  end if;

  -- Lock the parent item first (same order as
  -- adjust_inventory_item_quantity), deriving the real owner/item_id
  -- from the DB, never trusting anything client-supplied.
  select * into v_item
  from public.inventory_items
  where id = v_item_id
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

  -- Lock every batch on this item so the recompute below is consistent
  -- and DB-authoritative, then re-verify the target batch still exists
  -- and still belongs to this item.
  perform 1 from public.inventory_item_batches where item_id = v_item_id for update;

  select * into v_batch from public.inventory_item_batches where id = p_batch_id and item_id = v_item_id;
  if not found then
    raise exception 'INVALID_BATCH' using errcode = 'P0002';
  end if;

  update public.inventory_item_batches
  set qty = p_qty, unit_price = p_unit_price, expiry_date = p_expiry_date
  where id = p_batch_id;

  -- Recompute the item summary from ALL of the item's actual,
  -- now-locked batches (including the just-updated one) — never from
  -- any client-supplied total.
  select
    coalesce(sum(qty), 0),
    coalesce(case when sum(qty) > 0 then sum(qty * unit_price) / sum(qty) else 0 end, 0),
    min(expiry_date)
  into v_final_qty, v_final_price, v_final_expiry
  from public.inventory_item_batches
  where item_id = v_item_id;

  update public.inventory_items
  set quantity = v_final_qty, price = v_final_price, expiry_date = v_final_expiry
  where id = v_item_id;

  v_response := jsonb_build_object(
    'item_id', v_item_id,
    'batch_id', p_batch_id,
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

alter table public.inventory_mutation_idempotency
  drop constraint inventory_mutation_idempotency_operation_type_check;
alter table public.inventory_mutation_idempotency
  add constraint inventory_mutation_idempotency_operation_type_check
  check (operation_type in ('transfer', 'receive', 'adjust_quantity', 'batch_metadata'));

revoke all on function public.update_inventory_batch_metadata(uuid, numeric, numeric, date, uuid) from public;
revoke all on function public.update_inventory_batch_metadata(uuid, numeric, numeric, date, uuid) from anon;
grant execute on function public.update_inventory_batch_metadata(uuid, numeric, numeric, date, uuid) to authenticated;
