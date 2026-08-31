-- Phase INVENTORY-STOCK-MUTATION-IDEMPOTENCY-HARDENING
--
-- Closes TRANSFER_IDEMPOTENCY_BACKLOG and RECEIVE_STOCK_IDEMPOTENCY_BACKLOG.
--
-- Concurrency-safety (already delivered) and idempotency (this migration)
-- are different guarantees: concurrency-safety means two DIFFERENT
-- legitimate mutations never corrupt each other; idempotency means the
-- SAME logical mutation, retried, applies its stock effect exactly once.
-- Deliberately NOT inferred from business-field equality (item/room/qty/
-- price/etc.) — two legitimate user actions can share every business
-- field. Idempotency is keyed purely by a client-generated
-- idempotency_key that identifies one logical action; a genuinely new
-- action always gets a genuinely new key, even with identical payload.
--
-- STORAGE: a dedicated table, never directly client-writable (RLS
-- enabled with zero policies; the SECURITY DEFINER functions below are
-- owned by the same role that owns the table, so they operate under
-- ordinary table-owner privileges regardless of grants to
-- authenticated/anon). Scoped as (user_id, operation_type,
-- idempotency_key) per the phase's own design — user_id is always
-- auth.uid() of the CALLING user, never a client-supplied identity, so
-- one user can never claim, inspect, or short-circuit another user's
-- idempotency record even by guessing/reusing the same UUID.
--
-- CLAIM PATTERN (transactional, race-safe): each function attempts
-- `insert ... on conflict (user_id, operation_type, idempotency_key) do
-- nothing`. Postgres serializes this at the unique-index level: a
-- second transaction racing on the identical key blocks until the first
-- commits or rolls back, then either sees no conflict (first rolled
-- back — reclaim and execute normally) or sees the committed row
-- (first succeeded — skip the mutation, verify the fingerprint, return
-- the stored result). Because the claim insert and the mutation live in
-- the SAME transaction, a mutation failure rolls back the claim too, so
-- a legitimate retry after a genuine failure can claim the key again
-- rather than being permanently blocked.
--
-- FINGERPRINT: every claim also stores a deterministic hash of the
-- request's semantic inputs. Reusing a key with a DIFFERENT fingerprint
-- raises IDEMPOTENCY_KEY_REUSED and performs zero mutation — this is a
-- client-bug guard, not a retry path.
--
-- Both function signatures change (a required trailing p_idempotency_key
-- uuid), so the old overloads are explicitly dropped rather than left
-- callable — there is exactly one caller of each (App.tsx), already
-- being updated in this same phase, so no other consumer depends on the
-- old signature.

begin;

create table public.inventory_mutation_idempotency (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  operation_type text not null check (operation_type in ('transfer', 'receive')),
  idempotency_key uuid not null,
  request_fingerprint text not null,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, operation_type, idempotency_key)
);

alter table public.inventory_mutation_idempotency enable row level security;
-- Deliberately zero policies: default-deny for anon/authenticated via
-- PostgREST. Only the SECURITY DEFINER functions below (executing under
-- the table owner's privileges) can read or write this table.
revoke all on public.inventory_mutation_idempotency from public;
revoke all on public.inventory_mutation_idempotency from anon;
revoke all on public.inventory_mutation_idempotency from authenticated;

drop function if exists public.transfer_inventory_stock(uuid, uuid, uuid, numeric, uuid, uuid);

create function public.transfer_inventory_stock(
  p_source_item_id uuid,
  p_from_room_id uuid,
  p_to_room_id uuid,
  p_quantity numeric,
  p_idempotency_key uuid,
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
  v_fingerprint text;
  v_claim_id uuid;
  v_existing_claim record;
  v_response jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity = 'NaN'::numeric then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  if p_from_room_id = p_to_room_id then
    raise exception 'SAME_SOURCE_DESTINATION' using errcode = '22023';
  end if;

  -- Idempotency claim, scoped to the caller. Fingerprint covers every
  -- semantic input this function actually uses.
  v_fingerprint := md5(concat_ws('|',
    p_source_item_id::text, p_from_room_id::text, p_to_room_id::text,
    p_quantity::text, coalesce(p_source_batch_id::text, ''), coalesce(p_destination_item_id::text, '')
  ));

  insert into public.inventory_mutation_idempotency (user_id, operation_type, idempotency_key, request_fingerprint)
  values (v_caller_id, 'transfer', p_idempotency_key, v_fingerprint)
  on conflict (user_id, operation_type, idempotency_key) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    select * into v_existing_claim
    from public.inventory_mutation_idempotency
    where user_id = v_caller_id and operation_type = 'transfer' and idempotency_key = p_idempotency_key;

    if v_existing_claim.request_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;

    -- Same key, same payload: this is a retry of an already-committed
    -- action. Return the original result without touching stock again.
    return v_existing_claim.response_payload;
  end if;

  -- We own the claim — execute the mutation exactly as before.
  select * into v_source_item
  from public.inventory_items
  where id = p_source_item_id
    and room_id = p_from_room_id
  for update;

  if not found then
    raise exception 'INVALID_SOURCE_ITEM' using errcode = 'P0002';
  end if;

  v_owner_id := v_source_item.user_id;

  if v_caller_id <> v_owner_id and not exists (
    select 1 from public.collaborators
    where collaborators.user_id = v_caller_id
      and collaborators.owner_id = v_owner_id
      and collaborators.role in ('editor', 'admin')
  ) then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select * into v_dest_room
  from public.inventory_rooms
  where id = p_to_room_id
    and user_id = v_owner_id
  for update;

  if not found then
    raise exception 'INVALID_DESTINATION_TARGET' using errcode = 'P0002';
  end if;

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
    perform 1 from public.inventory_item_batches
    where item_id = p_source_item_id
    for update;

    v_available := v_source_item.quantity;
  end if;

  if p_quantity > v_available then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '22023';
  end if;

  if p_source_batch_id is not null then
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
      update public.inventory_item_batches set qty = v_leftover where id = v_batch.id;
    else
      delete from public.inventory_item_batches where id = v_batch.id;
    end if;
  else
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
          'id', case when v_move = v_batch.qty then v_batch.id else gen_random_uuid() end,
          'qty', v_move,
          'unit_price', v_batch.unit_price,
          'expiry_date', v_batch.expiry_date
        ));
      end if;

      v_leftover := v_batch.qty - v_move;
      if v_leftover > 0 then
        update public.inventory_item_batches set qty = v_leftover where id = v_batch.id;
      elsif v_move > 0 then
        delete from public.inventory_item_batches where id = v_batch.id;
      end if;

      v_remaining := v_remaining - v_move;
    end loop;
  end if;

  v_source_remaining := v_source_item.quantity - p_quantity;
  if v_source_remaining > 0 then
    update public.inventory_items
    set
      quantity = v_source_remaining,
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
  end if;

  if v_dest_item_id is null then
    select * into v_dest_item
    from public.inventory_items
    where room_id = p_to_room_id
      and user_id = v_owner_id
      and name = v_source_item.name
      and brand = v_source_item.brand
      and category = v_source_item.category
    order by created_at asc, id asc
    limit 1
    for update;

    if found then
      v_dest_item_id := v_dest_item.id;
    end if;
  end if;

  if v_dest_item_id is not null then
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

  v_response := jsonb_build_object(
    'source_item_id', p_source_item_id,
    'source_removed', v_source_removed,
    'source_remaining_quantity', greatest(v_source_remaining, 0),
    'destination_item_id', v_dest_item_id,
    'destination_quantity', v_dest_final_qty
  );

  update public.inventory_mutation_idempotency
  set response_payload = v_response
  where id = v_claim_id;

  return v_response;
end;
$$;

revoke all on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, uuid, uuid, uuid) from public;
revoke all on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, uuid, uuid, uuid) from anon;
grant execute on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, uuid, uuid, uuid) to authenticated;

drop function if exists public.receive_inventory_stock(uuid, text, text, text, numeric, numeric, text, text, text, text, date, date, boolean);

create function public.receive_inventory_stock(
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
  p_idempotency_key uuid,
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
  v_fingerprint text;
  v_claim_id uuid;
  v_existing_claim record;
  v_response jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if p_qty is null or p_qty <= 0 or p_qty = 'NaN'::numeric then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'INVALID_ITEM_NAME' using errcode = '22023';
  end if;

  v_fingerprint := md5(concat_ws('|',
    p_room_id::text, lower(p_name), lower(coalesce(p_brand, '')), coalesce(p_code, ''),
    p_qty::text, p_price::text, coalesce(p_uom, ''), coalesce(p_vendor, ''),
    coalesce(p_category, ''), coalesce(p_description, ''), coalesce(p_expiry_date::text, ''),
    coalesce(p_purchase_date::text, ''), p_create_new_batch::text
  ));

  insert into public.inventory_mutation_idempotency (user_id, operation_type, idempotency_key, request_fingerprint)
  values (v_caller_id, 'receive', p_idempotency_key, v_fingerprint)
  on conflict (user_id, operation_type, idempotency_key) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    select * into v_existing_claim
    from public.inventory_mutation_idempotency
    where user_id = v_caller_id and operation_type = 'receive' and idempotency_key = p_idempotency_key;

    if v_existing_claim.request_fingerprint <> v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;

    return v_existing_claim.response_payload;
  end if;

  select * into v_room
  from public.inventory_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'INVALID_ROOM' using errcode = 'P0002';
  end if;

  v_owner_id := v_room.user_id;

  if v_caller_id <> v_owner_id and not exists (
    select 1 from public.collaborators
    where collaborators.user_id = v_caller_id
      and collaborators.owner_id = v_owner_id
      and collaborators.role in ('editor', 'admin')
  ) then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

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

  v_response := jsonb_build_object(
    'item_id', v_item_id,
    'quantity', v_final_qty,
    'price', v_final_price,
    'expiry_date', v_final_expiry,
    'history_id', v_history_id
  );

  update public.inventory_mutation_idempotency
  set response_payload = v_response
  where id = v_claim_id;

  return v_response;
end;
$$;

revoke all on function public.receive_inventory_stock(uuid, text, text, text, numeric, numeric, text, text, text, text, uuid, date, date, boolean) from public;
revoke all on function public.receive_inventory_stock(uuid, text, text, text, numeric, numeric, text, text, text, text, uuid, date, date, boolean) from anon;
grant execute on function public.receive_inventory_stock(uuid, text, text, text, numeric, numeric, text, text, text, text, uuid, date, date, boolean) to authenticated;

commit;
