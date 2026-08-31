-- Phase INVENTORY-RECEIVE-STOCK-DUPLICATE-CREATION-HARDENING
--
-- Closes INVENTORY_RECEIVE_STOCK_DUPLICATE_CREATION_RISK.
--
-- ROOT CAUSE: receiveStock/receiveStockBatch (App.tsx) decide
-- existing-vs-create purely from the client's own local `rooms` React
-- state, then issue raw .upsert()/.insert() calls directly against
-- inventory_items/inventory_item_batches/inventory_purchase_history —
-- the exact same structural gap transfer_inventory_stock had before
-- INVENTORY-DESTINATION-MERGE-CONCURRENCY-HARDENING, but never patched
-- here. Two callers (two tabs, a retry, a collaborator + owner both
-- receiving) whose local state shows no matching item both independently
-- create a new item row instead of merging, producing a duplicate.
-- Reproduced directly against the live database as part of this phase
-- (see the phase's runtime test log): two concurrent client-equivalent
-- receive sequences for the same logical item created two separate
-- inventory_items rows instead of merging into one.
--
-- FIX: a single-item SECURITY DEFINER RPC, receive_inventory_stock,
-- modeled directly on transfer_inventory_stock's proven pattern — lock
-- the target room FOR UPDATE first (this also serializes every receive
-- into that room), then perform a fresh, lock-protected item lookup
-- inside the transaction rather than trusting client-decided state.
--
-- MATCHING SEMANTICS — deliberately NOT the same as transfer's exact
-- case-sensitive (name, brand, category) match. This reproduces
-- receiveStock's own existing matching rule exactly:
--   room.items.find(i =>
--     i.name.toLowerCase() === itemData.name.toLowerCase() &&
--     (itemData.brand ? i.brand.toLowerCase() === itemData.brand.toLowerCase() : true)
--   )
-- i.e. case-insensitive name match, brand match only enforced when a
-- non-empty brand was supplied (empty/missing brand matches any brand),
-- and NO category constraint at all. This is preserved as-is; unifying
-- it with transfer's stricter semantics would be a silent behavior
-- change, not a concurrency fix.
--
-- BATCH SEMANTICS — reproduces mergeBatchAdd() exactly: find the batch
-- whose expiry_date equals the incoming expiry (NULL is its own key);
-- if found, merge quantity/weighted-price into it; otherwise insert a
-- new batch row. p_create_new_batch=true (mirrors receiveStock's
-- explicit "always start a new batch" option) skips the merge-by-expiry
-- lookup and always inserts a new batch row — receiveStockBatch never
-- uses this option, matching its own unconditional mergeBatchAdd call.
--
-- DESCRIPTIVE-FIELD SEMANTICS — when merging into an EXISTING item,
-- mergeBatchAdd() only ever changes quantity/price/expiry_date/batches;
-- it never overwrites name/brand/code/vendor/category/description from
-- the incoming payload. This function preserves that exactly: those
-- columns are only ever written on the "no match, create new item"
-- branch.
--
-- HISTORICAL DUPLICATES ARE OUT OF SCOPE: when the fresh lookup matches
-- more than one existing row (the 15 pre-existing groups from the prior
-- audit), a deterministic `order by created_at asc, id asc limit 1`
-- picks exactly one target — the same rule transfer's own fallback
-- lookup uses — and the other sibling rows are left completely
-- untouched, never consolidated.

create or replace function public.receive_inventory_stock(
  p_room_id uuid,
  p_name text,
  p_brand text,
  p_code text,
  p_qty numeric,
  p_price numeric,
  p_uom text,
  p_vendor text,
  p_category text,
  p_description text,
  p_expiry_date date default null,
  p_purchase_date date default null,
  p_create_new_batch boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_owner_id uuid;
  v_room record;
  v_item record;
  v_item_id uuid;
  v_batch record;
  v_new_batch_qty numeric;
  v_new_batch_price numeric;
  v_final_qty numeric;
  v_final_price numeric;
  v_final_expiry date;
  v_history_id uuid;
begin
  -- 1. Authentication: identity comes only from auth.uid().
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Basic validation before touching any row.
  if p_qty is null or p_qty <= 0 or p_qty = 'NaN'::numeric then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'INVALID_ITEM_NAME' using errcode = '22023';
  end if;

  -- 3. Lock the target room FOR UPDATE — this both proves the room
  -- exists / derives the real owner, and serializes every concurrent
  -- receive into this room, exactly mirroring the destination-room
  -- lock strategy already proven for transfer_inventory_stock.
  select * into v_room
  from public.inventory_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'INVALID_ROOM' using errcode = 'P0002';
  end if;

  v_owner_id := v_room.user_id;

  -- 4. Ownership/authorization — never trust a client-supplied owner id.
  -- Same rule as transfer: owner, or editor/admin collaborator. Viewer
  -- and company-member-only access are deliberately excluded.
  if v_caller_id <> v_owner_id and not exists (
    select 1 from public.collaborators
    where collaborators.user_id = v_caller_id
      and collaborators.owner_id = v_owner_id
      and collaborators.role in ('editor', 'admin')
  ) then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  -- 5. Fresh, lock-protected item lookup (the actual concurrency fix —
  -- see header comment for exact matching semantics reproduced here).
  -- The room lock from step 3 guarantees this sees any competing
  -- receive's committed result rather than a stale client snapshot.
  select * into v_item
  from public.inventory_items
  where room_id = p_room_id
    and user_id = v_owner_id
    and lower(name) = lower(p_name)
    and (p_brand is null or p_brand = '' or lower(brand) = lower(p_brand))
  order by created_at asc, id asc
  limit 1
  for update;

  if found then
    v_item_id := v_item.id;

    if p_create_new_batch then
      insert into public.inventory_item_batches (id, item_id, qty, unit_price, expiry_date)
      values (gen_random_uuid(), v_item_id, p_qty, p_price, p_expiry_date);
    else
      select * into v_batch
      from public.inventory_item_batches
      where item_id = v_item_id
        and coalesce(expiry_date, '0001-01-01'::date) = coalesce(p_expiry_date, '0001-01-01'::date)
      for update;

      if found then
        v_new_batch_qty := v_batch.qty + p_qty;
        v_new_batch_price := case when v_new_batch_qty > 0
          then ((v_batch.qty * v_batch.unit_price) + (p_qty * p_price)) / v_new_batch_qty
          else p_price
        end;
        update public.inventory_item_batches
        set qty = v_new_batch_qty, unit_price = v_new_batch_price
        where id = v_batch.id;
      else
        insert into public.inventory_item_batches (id, item_id, qty, unit_price, expiry_date)
        values (gen_random_uuid(), v_item_id, p_qty, p_price, p_expiry_date);
      end if;
    end if;

    -- Recompute item.quantity/price/expiry_date from ALL of the item's
    -- batches (locked/authoritative), mirroring summarizeBatches().
    -- Descriptive fields (name/brand/code/vendor/category/description)
    -- are intentionally NOT touched here — matches mergeBatchAdd()'s
    -- exact behavior.
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
  else
    -- No match — create a new item + its first batch, using the
    -- incoming descriptive fields (matches receiveStock's "no existing
    -- item" branch exactly).
    v_item_id := gen_random_uuid();

    insert into public.inventory_items (
      id, room_id, user_id, name, brand, code, quantity, price, uom, vendor, category, description, expiry_date
    ) values (
      v_item_id, p_room_id, v_owner_id, p_name, coalesce(p_brand, ''), coalesce(p_code, ''),
      p_qty, p_price, coalesce(nullif(p_uom, ''), 'pcs'), coalesce(p_vendor, ''),
      coalesce(nullif(p_category, ''), 'other'), coalesce(p_description, ''), p_expiry_date
    );

    insert into public.inventory_item_batches (id, item_id, qty, unit_price, expiry_date)
    values (gen_random_uuid(), v_item_id, p_qty, p_price, p_expiry_date);

    v_final_qty := p_qty;
    v_final_price := p_price;
    v_final_expiry := p_expiry_date;
  end if;

  -- 6. Purchase-history row, written inside the same transaction so
  -- stock and history cannot diverge on partial failure.
  v_history_id := gen_random_uuid();
  insert into public.inventory_purchase_history (
    id, user_id, room_id, occurred_at, product_name, brand, code, vendor,
    qty, unit_price, total_price, location, category, uom, expiry_date
  ) values (
    v_history_id, v_owner_id, p_room_id,
    coalesce(p_purchase_date::timestamp, current_date::timestamp) + now()::time,
    p_name, coalesce(p_brand, ''), coalesce(p_code, ''), coalesce(p_vendor, ''),
    p_qty, p_price, p_qty * p_price, v_room.name, coalesce(nullif(p_category, ''), 'other'),
    coalesce(nullif(p_uom, ''), 'pcs'), p_expiry_date
  );

  return jsonb_build_object(
    'item_id', v_item_id,
    'quantity', v_final_qty,
    'price', v_final_price,
    'expiry_date', v_final_expiry,
    'history_id', v_history_id
  );
end;
$$;

-- Execution privileges: PUBLIC and anon must never be able to invoke
-- this — authenticated, ownership-checked mutations only.
revoke all on function public.receive_inventory_stock(uuid, text, text, text, numeric, numeric, text, text, text, text, date, date, boolean) from public;
revoke all on function public.receive_inventory_stock(uuid, text, text, text, numeric, numeric, text, text, text, text, date, date, boolean) from anon;
grant execute on function public.receive_inventory_stock(uuid, text, text, text, numeric, numeric, text, text, text, text, date, date, boolean) to authenticated;
