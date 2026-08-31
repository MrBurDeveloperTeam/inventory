-- Phase INVENTORY-COMPANY-MEMBERS-READONLY-INTERIM-FIX
--
-- Prior audit (INVENTORY-COMPANY-MEMBERS-POLICY-ORIGIN-AND-IMPACT-AUDIT)
-- confirmed public.company_members is an Inventory-native, in-progress
-- "company workspace sharing" feature (branch origin/fix/nicole/shareEndpoint,
-- not yet merged), and runtime-proved a confirmed authorization bypass:
-- the six live "active company members manage ..." ALL policies grant
-- full INSERT/UPDATE/DELETE to any active company_members row regardless
-- of its (unmapped, free-text) role, and this OR's past Inventory's own
-- collaborators.role='viewer' restriction entirely (a viewer + active
-- company member could still mutate/delete).
--
-- Interim remediation: downgrade all six company-member policies from
-- ALL to SELECT-only. Company members keep shared read visibility
-- (needed by the in-progress workspace switcher); no mutation authority
-- is granted through company_members alone until an explicit
-- dentist/nurse/reception -> permission-role mapping is designed
-- (tracked as INVENTORY_COMPANY_MEMBERS_ROLE_MAPPING_REQUIRED). Inventory's
-- own owner/collaborator policies (from 20260831203343) are untouched.

begin;

-- inventory_rooms: two redundant company-member policies existed (a
-- SELECT-only one and a broader ALL one). Replace both with a single
-- read-only policy.
drop policy if exists "active company members manage inventory rooms" on public.inventory_rooms;
drop policy if exists "active company members can read rooms" on public.inventory_rooms;
create policy "active company members can read inventory rooms"
  on public.inventory_rooms
  for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.member_user_id = auth.uid()
        and cm.company_owner_user_id = inventory_rooms.user_id
        and cm.status = 'active'
    )
  );

drop policy if exists "active company members manage inventory items" on public.inventory_items;
create policy "active company members can read inventory items"
  on public.inventory_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.member_user_id = auth.uid()
        and cm.company_owner_user_id = inventory_items.user_id
        and cm.status = 'active'
    )
  );

drop policy if exists "active company members manage inventory batches" on public.inventory_item_batches;
create policy "active company members can read inventory batches"
  on public.inventory_item_batches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.inventory_items item
      join public.company_members cm on cm.company_owner_user_id = item.user_id
      where item.id = inventory_item_batches.item_id
        and cm.member_user_id = auth.uid()
        and cm.status = 'active'
    )
  );

drop policy if exists "active company members manage inventory meta" on public.inventory_meta;
create policy "active company members can read inventory meta"
  on public.inventory_meta
  for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.member_user_id = auth.uid()
        and cm.company_owner_user_id = inventory_meta.user_id
        and cm.status = 'active'
    )
  );

drop policy if exists "active company members manage purchase history" on public.inventory_purchase_history;
create policy "active company members can read purchase history"
  on public.inventory_purchase_history
  for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.member_user_id = auth.uid()
        and cm.company_owner_user_id = inventory_purchase_history.user_id
        and cm.status = 'active'
    )
  );

drop policy if exists "active company members manage activity logs" on public.inventory_activity_logs;
create policy "active company members can read activity logs"
  on public.inventory_activity_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.member_user_id = auth.uid()
        and cm.company_owner_user_id = inventory_activity_logs.user_id
        and cm.status = 'active'
    )
  );

commit;
