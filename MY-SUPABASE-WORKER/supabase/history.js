import { sbInsert } from "./rest.js";

/**
 * Insert a purchase history entry
 */
export async function insertHistory(env, historyData) {
    await sbInsert(env, "inventory_purchase_history", [{
        id: historyData.id,
        user_id: historyData.user_id,
        room_id: historyData.room_id,
        occurred_at: historyData.occurred_at,
        product_name: historyData.product_name,
        brand: historyData.brand || "",
        code: historyData.code || "",
        vendor: historyData.vendor || "",
        qty: historyData.qty,
        unit_price: historyData.unit_price,
        total_price: historyData.total_price,
        location: historyData.location || "",
        category: historyData.category || "other",
        uom: historyData.uom || "pcs",
        expiry_date: historyData.expiry_date || null,
        description: historyData.description || "",
    }]);
    return historyData;
}
