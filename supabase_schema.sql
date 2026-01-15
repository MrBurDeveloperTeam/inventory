-- Normalized inventory schema (no JSON blobs)
create extension if not exists "pgcrypto";

-- Per-user layout/meta (blueprint + cat position)
create table if not exists inventory_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blueprint text,
  cat_position_x numeric(12,4) default 20,
  cat_position_y numeric(12,4) default 20,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Rooms on the clinic map
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  pos_x numeric(12,4) not null,
  pos_y numeric(12,4) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)
);

-- Items scoped to a room (one row per item instance)
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  brand text,
  code text,
  quantity numeric not null default 0,
  uom text check (uom in ('pcs','box','unit','kit')),
  price numeric(12,2) not null default 0,
  vendor text,
  category text check (category in ('consumables','equipment','instruments','materials','medication','ppe','other')),
  description text,
  expiry_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Batch-level detail for each item
create table if not exists item_batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  qty numeric not null,
  unit_price numeric(12,2) not null,
  expiry_date date,
  created_at timestamptz default now()
);

-- Activity feed
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  room_name text,
  action text check (action in ('add','remove','delete','transfer_out','transfer_in','edit','receive')),
  details text,
  created_at timestamptz default now()
);

-- Purchase history
create table if not exists purchase_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references rooms(id) on delete set null,
  item_id uuid references items(id) on delete set null,
  occurred_at timestamptz not null,
  product_name text,
  brand text,
  code text,
  vendor text,
  qty numeric,
  unit_price numeric(12,2),
  total_price numeric(12,2),
  location text,
  category text,
  uom text,
  expiry_date date,
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_rooms_user on rooms(user_id);
create index if not exists idx_items_room on items(room_id);
create index if not exists idx_item_batches_item on item_batches(item_id);
create index if not exists idx_activity_logs_user on activity_logs(user_id);
create index if not exists idx_purchase_history_user on purchase_history(user_id);

-- Enable RLS and basic per-user policies
alter table inventory_meta enable row level security;
alter table rooms enable row level security;
alter table items enable row level security;
alter table item_batches enable row level security;
alter table activity_logs enable row level security;
alter table purchase_history enable row level security;

-- Inventory meta: owner-only
drop policy if exists "inventory_meta owner read" on inventory_meta;
create policy "inventory_meta owner read"
  on inventory_meta for select
  using (auth.uid() = user_id);
drop policy if exists "inventory_meta owner write" on inventory_meta;
create policy "inventory_meta owner write"
  on inventory_meta for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Rooms: owner-only
drop policy if exists "rooms owner read" on rooms;
create policy "rooms owner read"
  on rooms for select
  using (auth.uid() = user_id);
drop policy if exists "rooms owner write" on rooms;
create policy "rooms owner write"
  on rooms for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Items: owner-only via user_id and room ownership
drop policy if exists "items owner read" on items;
create policy "items owner read"
  on items for select
  using (auth.uid() = user_id);
drop policy if exists "items owner write" on items;
create policy "items owner write"
  on items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Item batches: via parent item owner
drop policy if exists "item_batches owner read" on item_batches;
create policy "item_batches owner read"
  on item_batches for select
  using (exists (select 1 from items i where i.id = item_batches.item_id and i.user_id = auth.uid()));
drop policy if exists "item_batches owner write" on item_batches;
create policy "item_batches owner write"
  on item_batches for all
  using (exists (select 1 from items i where i.id = item_batches.item_id and i.user_id = auth.uid()))
  with check (exists (select 1 from items i where i.id = item_batches.item_id and i.user_id = auth.uid()));

-- Activity logs: owner-only
drop policy if exists "activity_logs owner read" on activity_logs;
create policy "activity_logs owner read"
  on activity_logs for select
  using (auth.uid() = user_id);
drop policy if exists "activity_logs owner write" on activity_logs;
create policy "activity_logs owner write"
  on activity_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Purchase history: owner-only
drop policy if exists "purchase_history owner read" on purchase_history;
create policy "purchase_history owner read"
  on purchase_history for select
  using (auth.uid() = user_id);
drop policy if exists "purchase_history owner write" on purchase_history;
create policy "purchase_history owner write"
  on purchase_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Migration: explode inventories JSON into normalized tables
do $$
declare
  inv record;
  r record;
  i record;
  b record;
  h record;
  l record;
  room_uuid uuid;
  item_uuid uuid;
begin
  create temporary table if not exists tmp_room_map (
    user_id uuid,
    old_id bigint,
    new_id uuid
  ) on commit drop;

  for inv in select * from inventories loop
    -- meta
    insert into inventory_meta (user_id, blueprint, cat_position_x, cat_position_y)
    values (
      inv.user_id,
      coalesce(inv.data->>'blueprint', inv.blueprint),
      nullif(inv.data->'catPosition'->>'x','')::numeric,
      nullif(inv.data->'catPosition'->>'y','')::numeric
    )
    on conflict (user_id) do update
    set blueprint = excluded.blueprint,
        cat_position_x = coalesce(excluded.cat_position_x, inventory_meta.cat_position_x),
        cat_position_y = coalesce(excluded.cat_position_y, inventory_meta.cat_position_y),
        updated_at = now();

    delete from tmp_room_map where user_id = inv.user_id;

    -- rooms and items
    for r in
      select * from jsonb_to_recordset(coalesce(inv.data->'rooms', '[]'::jsonb))
        as (id bigint, name text, x numeric, y numeric, items jsonb)
    loop
      insert into rooms (id, user_id, name, pos_x, pos_y)
      values (gen_random_uuid(), inv.user_id, coalesce(r.name, 'Room'), coalesce(r.x, 0), coalesce(r.y, 0))
      on conflict (user_id, name) do update
        set pos_x = excluded.pos_x,
            pos_y = excluded.pos_y,
            updated_at = now()
      returning id into room_uuid;

      insert into tmp_room_map values (inv.user_id, r.id, room_uuid);

      for i in
        select * from jsonb_to_recordset(coalesce(r.items, '[]'::jsonb))
          as (id bigint, name text, brand text, code text, quantity numeric, uom text, price numeric, vendor text, category text, description text, "expiryDate" text, batches jsonb)
      loop
        insert into items (user_id, room_id, name, brand, code, quantity, uom, price, vendor, category, description, expiry_date)
        values (
          inv.user_id,
          room_uuid,
          coalesce(i.name, 'Item'),
          i.brand,
          i.code,
          coalesce(i.quantity, 0),
          nullif(i.uom, '')::text,
          coalesce(i.price, 0),
          i.vendor,
          nullif(i.category, '')::text,
          i.description,
          nullif(i."expiryDate", '')::date
        )
        returning id into item_uuid;

        if i.batches is not null then
          for b in
            select * from jsonb_to_recordset(i.batches)
              as (qty numeric, "unitPrice" numeric, "expiryDate" text)
          loop
            insert into item_batches (item_id, qty, unit_price, expiry_date)
            values (item_uuid, coalesce(b.qty, 0), coalesce(b."unitPrice", 0), nullif(b."expiryDate", '')::date);
          end loop;
        end if;
      end loop;
    end loop;

    -- purchase history
    for h in
      select * from jsonb_to_recordset(coalesce(inv.data->'history', '[]'::jsonb))
        as (id text, "timestamp" text, "productName" text, brand text, code text, vendor text, qty numeric, "unitPrice" numeric, "totalPrice" numeric, location text, category text, "roomId" bigint, uom text, "expiryDate" text)
    loop
      insert into purchase_history (
        user_id, room_id, occurred_at, product_name, brand, code, vendor, qty, unit_price, total_price, location, category, uom, expiry_date
      )
      values (
        inv.user_id,
        (select new_id from tmp_room_map where user_id = inv.user_id and old_id = h."roomId"),
        coalesce(nullif(h."timestamp", '')::timestamptz, now()),
        h."productName",
        h.brand,
        h.code,
        h.vendor,
        h.qty,
        h."unitPrice",
        h."totalPrice",
        h.location,
        h.category,
        h.uom,
        nullif(h."expiryDate", '')::date
      );
    end loop;

    -- activity logs
    for l in
      select * from jsonb_to_recordset(coalesce(inv.data->'logs', '[]'::jsonb))
        as (id text, "timestamp" text, "roomId" bigint, "roomName" text, action text, details text)
    loop
      insert into activity_logs (id, user_id, room_id, room_name, action, details, created_at)
      values (
        coalesce(nullif(l.id, '')::uuid, gen_random_uuid()),
        inv.user_id,
        (select new_id from tmp_room_map where user_id = inv.user_id and old_id = l."roomId"),
        l."roomName",
        l.action,
        l.details,
        coalesce(nullif(l."timestamp", '')::timestamptz, now())
      )
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;
