import { sbGetMaybeSingle, sbGetList } from "./rest.js";
import { upsertInventoryMeta } from "./upsertInventoryMeta.js";
import { getInventoryMetaByUserId } from "./inventoryMeta.js";

export async function supabaseBootstrapByEmail(env, email) {
  // profiles (maybe single)
  const profiles_data = await sbGetMaybeSingle(env, "profiles", {
    email: `eq.${email}`,
    select: "*",
    limit: 1,
  });

  if (!profiles_data) {
    return {
      profiles: null,
      setting_data: null,
      meta: [],
      rooms: [],
      rooms_error: null,
      items_data: [],
      history_data: [],
      log_data: [],
    };
  }

  // normalize user id
  const userId = profiles_data.user_id ?? profiles_data.id;
  if (!userId) throw new Error("Profile missing user_id");

  console.log("[bootstrap] profile found:", JSON.stringify({
    email: profiles_data.email,
    id: userId,
  }));

  /* ===========================
     🔑 inventory_meta (ENSURE)
     =========================== */

  let meta_data = await getInventoryMetaByUserId(env, userId);

  // If meta row does not exist → UPSERT default
  if (!meta_data || meta_data.length === 0) {
    await upsertInventoryMeta(env, {
      user_id: userId,
      // defaults (optional but recommended)
      cat_position_x: 20,
      cat_position_y: 20,
      blueprint: null,
    });

    // re-read after upsert
    meta_data = await getInventoryMetaByUserId(env, userId);
  }

  /* ===========================
     inventory_rooms
     =========================== */
  const rooms_data = await sbGetList(env, "inventory_rooms", {
    user_id: `eq.${userId}`,
    select: "id,name,pos_x,pos_y",
  });

  const room_ids = (rooms_data || []).map((r) => r.id);

  /* ===========================
     inventory_items + batches
     =========================== */
  const items_data =
    room_ids.length > 0
      ? await sbGetList(env, "inventory_items", {
          select: "*,item_batches:inventory_item_batches(*)",
          room_id: `in.(${room_ids.join(",")})`,
        })
      : [];

  /* ===========================
     inventory_purchase_history
     =========================== */
  const history_data = await sbGetList(env, "inventory_purchase_history", {
    user_id: `eq.${userId}`,
    select: "*",
    order: "occurred_at.desc",
  });

  /* ===========================
     inventory_activity_logs
     =========================== */
  const log_data = await sbGetList(env, "inventory_activity_logs", {
    user_id: `eq.${userId}`,
    select: "*",
    order: "created_at.desc",
  });

  /* ===========================
     apt_settings (clinic scoped)
     =========================== */
  const clinicId = profiles_data.clinic_id;
  const setting_data = clinicId
    ? await sbGetMaybeSingle(env, "apt_settings", {
        clinic_id: `eq.${clinicId}`,
        select: "*",
        limit: 1,
      })
    : null;

  /* ===========================
     ✅ FINAL RESPONSE (PYTHON-MATCH)
     =========================== */
  return {
    profiles: profiles_data,
    setting_data,
    meta: meta_data,
    rooms: rooms_data,
    rooms_error: null,
    items_data,
    history_data,
    log_data,
  };
}
