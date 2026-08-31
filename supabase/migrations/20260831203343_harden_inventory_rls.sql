-- Phase INVENTORY-LIVE-RLS-VERIFICATION-AND-HARDENING
--
-- Runtime RLS audit against the live database confirmed the Inventory
-- collaborator-based authorization model (owner full access; admin full
-- access to rooms/items/batches/meta/history; editor read/write on
-- items/batches/meta/history but not rooms; viewer read-only) is enforced
-- correctly for every SELECT/INSERT/UPDATE/DELETE path tested, with one
-- exception: WITH CHECK on inventory_items and inventory_purchase_history
-- validates only the row's own `user_id`, never that `room_id` (when set)
-- points to a room owned by that same user_id. This lets an owner/editor
-- reassign their own item (or a history row) onto a completely unrelated
-- user's room_id. Confirmed via runtime test that this does NOT leak data
-- cross-user (SELECT/UPDATE/DELETE remain strictly keyed off `user_id`,
-- so the row stays invisible/unreachable to the room's actual owner) —
-- it is a relational-integrity gap, not a data-exposure one. Hardened
-- anyway per the phase's explicit "prevent cross-owner FK abuse" scope.
--
-- Out of scope / intentionally NOT touched by this migration (documented
-- in the phase's Final Report, not fixed here):
--   - The `active company members manage ...` policies present on every
--     Inventory table, driven by public.company_members (a table the
--     Inventory app never references). This grants any "active company
--     member" of an owner full ALL access, independent of Inventory's own
--     collaborator roles. Flagged as an unresolved cross-app finding per
--     explicit user decision, not altered here.
--   - inventory_rooms admin-only mutation policy, and viewer-can-write
--     inventory_activity_logs — both confirmed to match current shipped
--     product behavior, not defects.

begin;

-- inventory_items: require that room_id (if set) belongs to the same
-- owner as the item row itself.
alter policy "Owners and Editors can manage items"
  on public.inventory_items
  with check (
    (
      (user_id = auth.uid())
      or (exists (
        select 1 from public.collaborators c
        where c.owner_id = inventory_items.user_id
          and c.user_id = auth.uid()
          and c.role = any (array['editor'::text, 'admin'::text])
      ))
    )
    and (
      inventory_items.room_id is null
      or exists (
        select 1 from public.inventory_rooms r
        where r.id = inventory_items.room_id
          and r.user_id = inventory_items.user_id
      )
    )
  );

-- inventory_purchase_history: same relational check, applied to both
-- write-capable policies (multiple permissive policies are OR'd, so both
-- must carry the check or either alone would still permit the bypass).
alter policy "Owners and Editors can manage history"
  on public.inventory_purchase_history
  with check (
    (
      (user_id = auth.uid())
      or (exists (
        select 1 from public.collaborators c
        where c.owner_id = inventory_purchase_history.user_id
          and c.user_id = auth.uid()
          and c.role = any (array['editor'::text, 'admin'::text])
      ))
    )
    and (
      inventory_purchase_history.room_id is null
      or exists (
        select 1 from public.inventory_rooms r
        where r.id = inventory_purchase_history.room_id
          and r.user_id = inventory_purchase_history.user_id
      )
    )
  );

alter policy "Enable insert on history"
  on public.inventory_purchase_history
  with check (
    (
      (user_id = auth.uid())
      or (exists (
        select 1 from public.collaborators c
        where c.owner_id = inventory_purchase_history.user_id
          and c.user_id = auth.uid()
      ))
    )
    and (
      inventory_purchase_history.room_id is null
      or exists (
        select 1 from public.inventory_rooms r
        where r.id = inventory_purchase_history.room_id
          and r.user_id = inventory_purchase_history.user_id
      )
    )
  );

commit;
