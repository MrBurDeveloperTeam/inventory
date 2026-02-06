import { sbDelete, sbInsert, sbUpsert } from "./rest.js";
import { upsertInventoryMeta } from "./upsertInventoryMeta.js";

export async function inventoryFullSync(env, payload) {
  const {
    user_id,
    blueprint,
    cat_position,
    rooms,
    items,
    item_batches,
    history,
    logs,
  } = payload;

  /* ===========================
     1️⃣ inventory_meta (UPSERT)
     =========================== */
  await upsertInventoryMeta(env, {
    user_id,
    blueprint,
    cat_position_x: cat_position.x,
    cat_position_y: cat_position.y,
  });

  /* ===========================
     2️⃣ WIPE dependent tables
     =========================== */
  await sbDelete(env, "inventory_activity_logs", { user_id: `eq.${user_id}` });
  await sbDelete(env, "inventory_purchase_history", { user_id: `eq.${user_id}` });
  await sbDelete(env, "inventory_rooms", { user_id: `eq.${user_id}` });
  // inventory_items + batches cascade via FK

  /* ===========================
     3️⃣ INSERT rooms
     =========================== */
  await sbInsert(env, "inventory_rooms", rooms.map(r => ({
    id: r.id,
    user_id,
    name: r.name,
    pos_x: r.pos_x,
    pos_y: r.pos_y,
  })));

  const allowedRoomIds = new Set(rooms.map(r => r.id));

  /* ===========================
     4️⃣ UPSERT items
     =========================== */
  const filteredItems = items
    .filter(i => allowedRoomIds.has(i.room_id))
    .reduce((m, i) => (m.set(i.id, i), m), new Map())
    .values();

  await sbUpsert(
    env,
    "inventory_items",
    [...filteredItems],
    "id"
  );

  /* ===========================
     5️⃣ INSERT item_batches
     =========================== */
  const dedupBatches = new Map();
  for (const b of item_batches) {
    const key = `${b.item_id}|${b.expiry_date || "none"}|${b.qty}|${b.unit_price}`;
    dedupBatches.set(key, b);
  }

  await sbInsert(
    env,
    "inventory_item_batches",
    [...dedupBatches.values()]
  );

  /* ===========================
     6️⃣ INSERT purchase history
     =========================== */
  await sbInsert(
    env,
    "inventory_purchase_history",
    [...new Map(history.map(h => [h.id, h])).values()]
  );

  /* ===========================
     7️⃣ INSERT activity logs
     =========================== */
  await sbInsert(
    env,
    "inventory_activity_logs",
    [...new Map(logs.map(l => [l.id, l])).values()]
  );

  return { ok: true };
}
