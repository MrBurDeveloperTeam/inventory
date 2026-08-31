-- Phase INVENTORY-TRANSFER-ATOMIC-RPC-IMPLEMENTATION
--
-- Replaces the browser's multi-request source/destination write sequence in
-- App.tsx's moveItem() with one atomic Postgres transaction, closing
-- TRANSFER_PARTIAL_WRITE_RISK for the item+batch quantity data proven by the
-- prior INVENTORY-TRANSFER-ATOMICITY-AUDIT phase.
--
-- NOT APPLIED LIVE BY THIS MIGRATION FILE ITSELF. This file is versioned
-- source only, per this phase's explicit instruction; a later,
-- explicitly-authorized phase applies it to the live database and
-- runtime-verifies it.
--
-- SCOPE: this function intentionally does NOT write to
-- inventory_activity_logs. Activity logging in the current App.tsx is
-- already a separate, independent, best-effort, fire-and-forget side
-- channel (addActivity() is called without `await` from moveItem, and its
-- own failures are only console.error'd, never thrown) — it was never part
-- of the item/batch quantity consistency guarantee this phase targets, and
-- folding it into this transaction would silently change its existing
-- failure-tolerant behavior. The client continues to call addActivity()
-- exactly as it does today, unaffected by this migration.
--
-- PARAMETER DESIGN NOTE: the client's current moveItem() has an optional
-- `batchIndex: number` — a position within a JS array. There is no
-- database-side equivalent of "array position N" for inventory_item_batches
-- rows (they are identified only by their own primary key, not an ordinal
-- column). This function therefore accepts an explicit
-- `p_source_batch_id uuid` (the actual batch row id the client already has
-- as item.batches[batchIndex].id) instead of a positional index, and
-- revalidates that id belongs to the source item before using it. This is
-- the smallest faithful adaptation of the existing parameter's *intent*
-- (target one specific batch) to a form the database can trust and verify.
--
-- ORDERING NOTE (source batch consumption when no specific batch is
-- targeted): the existing client-side splitBatchesForTransfer() consumes
-- batches in whatever order the JS array happens to hold them, which is not
-- itself a defined, reproducible business rule (no `sort_order`/
-- `created_at` column exists on inventory_item_batches to encode one). This
-- function orders by `expiry_date ASC NULLS LAST, id ASC` (first-expiring-
-- first-out), which is the most defensible faithful reading of the
-- feature's evident intent for a dental/medical consumable inventory. This
-- is a deliberate, documented decision, not a silent behavior change: no
-- prior explicit ordering guarantee existed to preserve.

create or replace function public.transfer_inventory_stock(
  p_source_item_id uuid,
  p_from_room_id uuid,
  p_to_room_id uuid,
  p_quantity numeric,
  p_source_batch_id uuid default null,
  p_destination_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_owner_id uuid;
  v_source_item record;
  v_dest_room record;
  v_available numeric;
  v_remaining numeric;
  v_batch record;
  v_move numeric;
  v_leftover numeric;
  v_moved_total_qty numeric := 0;
  v_moved_total_value numeric := 0;
  v_moved_earliest_expiry date;
  v_dest_item record;
  v_dest_item_id uuid;
  v_dest_final_qty numeric;
  v_dest_final_price numeric;
  v_dest_final_expiry date;
  v_source_remaining numeric;
  v_source_removed boolean := false;
  v_moved_rows jsonb := '[]'::jsonb;
  v_existing_dest_batch record;
begin
  -- 1. Authentication: caller identity comes only from auth.uid(), never a
  -- client-supplied parameter.
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Basic quantity shape validation before touching any row.
  if p_quantity is null or p_quantity <= 0 or p_quantity = 'NaN'::numeric then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  -- 3. Same-room rejection is authoritative here regardless of client-side
  -- validation.
  if p_from_room_id = p_to_room_id then
    raise exception 'SAME_SOURCE_DESTINATION' using errcode = '22023';
  end if;

  -- 4. Lock the source item row FOR UPDATE — the database's own current
  -- quantity is the only value trusted for validation and computation
  -- below, never a client-supplied "remaining quantity".
  select * into v_source_item
  from public.inventory_items
  where id = p_source_item_id
    and room_id = p_from_room_id
  for update;

  if not found then
    raise exception 'INVALID_SOURCE_ITEM' using errcode = 'P0002';
  end if;

  v_owner_id := v_source_item.user_id;

  -- 5. Ownership/authorization: the caller must either own this inventory
  -- outright, or be a collaborator on it with a mutation-capable role.
  -- 'viewer' is deliberately excluded — matches the app's own three-role
  -- model (viewer/editor/admin) already in use for the Collaborators
  -- feature. Never trust a client-supplied owner/user id for this check.
  if v_caller_id <> v_owner_id and not exists (
    select 1 from public.collaborators
    where collaborators.user_id = v_caller_id
      and collaborators.owner_id = v_owner_id
      and collaborators.role in ('editor', 'admin')
  ) then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  -- 6. Destination room must exist and belong to the SAME owner as the
  -- source item — a transfer never crosses between different owners'
  -- inventories, and this must be proven from the database, not assumed
  -- from a client-supplied room id.
  select * into v_dest_room
  from public.inventory_rooms
  where id = p_to_room_id
    and user_id = v_owner_id
  for update;

  if not found then
    raise exception 'INVALID_DESTINATION_TARGET' using errcode = 'P0002';
  end if;

  -- 7. Determine available quantity and lock the relevant batch row(s)
  -- FOR UPDATE so a concurrent transfer of the same item cannot compute
  -- from a stale snapshot.
  if p_source_batch_id is not null then
    select * into v_batch
    from public.inventory_item_batches
    where id = p_source_batch_id
      and item_id = p_source_item_id
    for update;

    if not found then
      raise exception 'INVALID_SOURCE_ITEM' using errcode = 'P0002';
    end if;

    v_available := v_batch.qty;
  else
    -- Lock every batch row for this item so the FEFO consumption loop
    -- below reads a fully-locked, consistent set.
    perform 1 from public.inventory_item_batches
    where item_id = p_source_item_id
    for update;

    v_available := v_source_item.quantity;
  end if;

  if p_quantity > v_available then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '22023';
  end if;

  -- 8. Compute and apply source-side batch consumption.
  if p_source_batch_id is not null then
    -- Single targeted batch. All other batches on this item are left
    -- completely untouched — matches the client's existing batchIndex
    -- path, which only ever mutates the one targeted batch. The moved
    -- portion always gets a fresh id here (never reuses the source batch's
    -- id), matching the client's existing behavior for this specific path.
    v_move := p_quantity;
    v_leftover := v_batch.qty - v_move;

    v_moved_total_qty := v_move;
    v_moved_total_value := v_move * v_batch.unit_price;
    v_moved_earliest_expiry := v_batch.expiry_date;
    v_moved_rows := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'qty', v_move,
      'unit_price', v_batch.unit_price,
      'expiry_date', v_batch.expiry_date
    ));

    if v_leftover > 0 then
      update public.inventory_item_batches
      set qty = v_leftover
      where id = v_batch.id;
    else
      delete from public.inventory_item_batches where id = v_batch.id;
    end if;
  else
    -- FEFO consumption across all of this item's batches, in expiry order.
    v_remaining := p_quantity;

    for v_batch in
      select * from public.inventory_item_batches
      where item_id = p_source_item_id
      order by expiry_date asc nulls last, id asc
    loop
      exit when v_remaining <= 0;

      v_move := least(v_batch.qty, v_remaining);
      if v_move > 0 then
        v_moved_total_qty := v_moved_total_qty + v_move;
        v_moved_total_value := v_moved_total_value + (v_move * v_batch.unit_price);
        if v_moved_earliest_expiry is null or (v_batch.expiry_date is not null and v_batch.expiry_date < v_moved_earliest_expiry) then
          v_moved_earliest_expiry := v_batch.expiry_date;
        end if;
        v_moved_rows := v_moved_rows || jsonb_build_array(jsonb_build_object(
          -- Reuse the source batch's own id only when the ENTIRE batch
          -- moved — matches the client's existing splitBatchesForTransfer
          -- rule exactly.
          'id', case when v_move = v_batch.qty then v_batch.id else gen_random_uuid() end,
          'qty', v_move,
          'unit_price', v_batch.unit_price,
          'expiry_date', v_batch.expiry_date
        ));
      end if;

      v_leftover := v_batch.qty - v_move;
      if v_leftover > 0 then
        update public.inventory_item_batches
        set qty = v_leftover
        where id = v_batch.id;
      elsif v_move > 0 then
        delete from public.inventory_item_batches where id = v_batch.id;
      end if;

      v_remaining := v_remaining - v_move;
    end loop;
  end if;

  -- 9. Update or remove the source item row itself.
  v_source_remaining := v_source_item.quantity - p_quantity;
  if v_source_remaining > 0 then
    update public.inventory_items
    set
      quantity = v_source_remaining,
      -- price/expiry_date are recomputed from the item's own remaining
      -- batches, mirroring summarizeBatches()'s weighted-average /
      -- earliest-expiry logic used by the client after every batch change.
      price = coalesce((
        select case when sum(qty) > 0 then sum(qty * unit_price) / sum(qty) else 0 end
        from public.inventory_item_batches where item_id = p_source_item_id
      ), 0),
      expiry_date = (
        select min(expiry_date) from public.inventory_item_batches
        where item_id = p_source_item_id and expiry_date is not null
      )
    where id = p_source_item_id;
  else
    delete from public.inventory_item_batches where item_id = p_source_item_id;
    delete from public.inventory_items where id = p_source_item_id;
    v_source_removed := true;
  end if;

  -- 10. Resolve and revalidate the destination merge target. A
  -- client-supplied p_destination_item_id is NEVER trusted blindly — it
  -- must exist, belong to the destination room and the same owner, and
  -- match the source item's identity exactly as the client's own
  -- `existingInTarget` lookup does (case-sensitive name/brand/category
  -- equality — preserved exactly, not loosened to case-insensitive).
  v_dest_item_id := null;
  if p_destination_item_id is not null then
    select * into v_dest_item
    from public.inventory_items
    where id = p_destination_item_id
      and room_id = p_to_room_id
      and user_id = v_owner_id
      and name = v_source_item.name
      and brand = v_source_item.brand
      and category = v_source_item.category
    for update;

    if found then
      v_dest_item_id := v_dest_item.id;
    end if;
    -- If the supplied id does not revalidate, it is silently treated as
    -- "no merge target" (a new destination item is created below) rather
    -- than raised as an error — mirrors the client's own tolerant
    -- `existingInTarget` semantics, which never errors on a missing/stale
    -- match, it just falls through to creating a new item.
  end if;

  if v_dest_item_id is not null then
    -- Merge ALL moved batch portions as ONE aggregate mergeBatchAdd-style
    -- operation, keyed by the moved batches' collective earliest expiry —
    -- matches the client's existing mergeBatchAdd(existingInTarget,
    -- movedItemTemplate.quantity, movedItemTemplate.price,
    -- movedItemTemplate.expiryDate) call exactly (a single merge of the
    -- aggregate, not a per-source-batch merge).
    select * into v_existing_dest_batch
    from public.inventory_item_batches
    where item_id = v_dest_item_id
      and coalesce(expiry_date, '0001-01-01'::date) = coalesce(v_moved_earliest_expiry, '0001-01-01'::date)
    for update;

    if found then
      update public.inventory_item_batches
      set
        qty = v_existing_dest_batch.qty + v_moved_total_qty,
        unit_price = case when (v_existing_dest_batch.qty + v_moved_total_qty) > 0
          then ((v_existing_dest_batch.qty * v_existing_dest_batch.unit_price) + v_moved_total_value) / (v_existing_dest_batch.qty + v_moved_total_qty)
          else (v_moved_total_value / greatest(v_moved_total_qty, 1))
        end
      where id = v_existing_dest_batch.id;
    else
      insert into public.inventory_item_batches (id, item_id, qty, unit_price, expiry_date)
      values (gen_random_uuid(), v_dest_item_id, v_moved_total_qty,
        case when v_moved_total_qty > 0 then v_moved_total_value / v_moved_total_qty else 0 end,
        v_moved_earliest_expiry);
    end if;

    select
      coalesce(sum(qty), 0),
      coalesce(case when sum(qty) > 0 then sum(qty * unit_price) / sum(qty) else 0 end, 0),
      min(expiry_date)
    into v_dest_final_qty, v_dest_final_price, v_dest_final_expiry
    from public.inventory_item_batches
    where item_id = v_dest_item_id;

    update public.inventory_items
    set quantity = v_dest_final_qty, price = v_dest_final_price, expiry_date = v_dest_final_expiry
    where id = v_dest_item_id;
  else
    -- No valid merge target — create a new destination item, preserving
    -- the source item's descriptive metadata, and insert the individually
    -- moved batch rows as-is (not collapsed) — matches the client's
    -- movedItemTemplate = {...item, id: generateId(), batches: moved, ...}.
    v_dest_item_id := gen_random_uuid();

    insert into public.inventory_items (
      id, room_id, user_id, name, brand, code, quantity, price, uom, vendor, category, description, expiry_date
    ) values (
      v_dest_item_id, p_to_room_id, v_owner_id, v_source_item.name, v_source_item.brand, v_source_item.code,
      v_moved_total_qty,
      case when v_moved_total_qty > 0 then v_moved_total_value / v_moved_total_qty else 0 end,
      v_source_item.uom, v_source_item.vendor, v_source_item.category, v_source_item.description,
      v_moved_earliest_expiry
    );

    insert into public.inventory_item_batches (id, item_id, qty, unit_price, expiry_date)
    select
      (elem->>'id')::uuid,
      v_dest_item_id,
      (elem->>'qty')::numeric,
      (elem->>'unit_price')::numeric,
      nullif(elem->>'expiry_date', '')::date
    from jsonb_array_elements(v_moved_rows) as elem;

    v_dest_final_qty := v_moved_total_qty;
  end if;

  return jsonb_build_object(
    'source_item_id', p_source_item_id,
    'source_removed', v_source_removed,
    'source_remaining_quantity', greatest(v_source_remaining, 0),
    'destination_item_id', v_dest_item_id,
    'destination_quantity', v_dest_final_qty
  );
end;
$$;

-- Execution privileges: PUBLIC and anon must never be able to invoke this —
-- it performs authenticated, ownership-checked mutations only.
revoke all on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, uuid, uuid) from public;
revoke all on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, uuid, uuid) from anon;
grant execute on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, uuid, uuid) to authenticated;
