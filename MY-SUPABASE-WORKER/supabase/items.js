import { sbDelete, sbUpsert, sbInsert } from "./rest.js";

/**
 * Upsert an item (create or update)
 */
export async function upsertItem(env, itemData) {
    const row = {
        id: itemData.id,
        room_id: itemData.room_id,
        user_id: itemData.user_id,
        name: itemData.name,
        brand: itemData.brand || "",
        code: itemData.code || "",
        quantity: itemData.quantity,
        price: itemData.price,
        uom: itemData.uom || "pcs",
        vendor: itemData.vendor || "",
        category: itemData.category || "other",
        description: itemData.description || "",
        expiry_date: itemData.expiry_date || null,
    };

    await sbUpsert(env, "inventory_items", [row], "id");
    return row;
}

/**
 * Delete an item and its batches
 */
export async function deleteItem(env, itemId) {
    // Delete batches first
    await sbDelete(env, "inventory_item_batches", { item_id: `eq.${itemId}` });
    // Delete item
    await sbDelete(env, "inventory_items", { id: `eq.${itemId}` });
    return { deleted: true };
}

/**
 * Update specific fields of an item
 */
export async function updateItem(env, itemId, fields) {
    const url = `${env.SUPABASE_URL}/rest/v1/inventory_items?id=eq.${itemId}`;

    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
        },
        body: JSON.stringify(fields),
    });

    if (!res.ok) {
        throw new Error(`Failed to update item: ${await res.text()}`);
    }

    return { updated: true };
}

/**
 * Receive stock - complex operation that upserts item, syncs batches, and creates history
 */
export async function receiveStock(env, payload) {
    const { item, batches, history } = payload;

    // 1. Upsert the item
    await upsertItem(env, item);

    // 2. Upsert batches
    if (batches && batches.length > 0) {
        for (const batch of batches) {
            await sbUpsert(env, "inventory_item_batches", [{
                id: batch.id,
                item_id: item.id,
                qty: batch.qty,
                unit_price: batch.unit_price,
                expiry_date: batch.expiry_date || null,
            }], "id");
        }
    }

    // 3. Insert history
    if (history) {
        await sbInsert(env, "inventory_purchase_history", [history]);
    }

    return { success: true };
}

/**
 * Transfer items between rooms - updates source and destination
 */
export async function transferItem(env, payload) {
    const { sourceItem, destinationItem, deletedBatchIds } = payload;

    // 1. Handle source item
    if (sourceItem) {
        if (sourceItem.quantity <= 0) {
            // Delete source item entirely
            await deleteItem(env, sourceItem.id);
        } else {
            // Update source item
            await upsertItem(env, sourceItem);

            // Sync source batches
            if (sourceItem.batches) {
                // Delete removed batches
                if (deletedBatchIds && deletedBatchIds.length > 0) {
                    await sbDelete(env, "inventory_item_batches", {
                        id: `in.(${deletedBatchIds.join(",")})`,
                    });
                }
                // Upsert remaining batches
                for (const batch of sourceItem.batches) {
                    await sbUpsert(env, "inventory_item_batches", [{
                        id: batch.id,
                        item_id: sourceItem.id,
                        qty: batch.qty,
                        unit_price: batch.unit_price,
                        expiry_date: batch.expiry_date || null,
                    }], "id");
                }
            }
        }
    }

    // 2. Handle destination item
    if (destinationItem) {
        await upsertItem(env, destinationItem);

        // Upsert destination batches
        if (destinationItem.batches) {
            for (const batch of destinationItem.batches) {
                await sbUpsert(env, "inventory_item_batches", [{
                    id: batch.id,
                    item_id: destinationItem.id,
                    qty: batch.qty,
                    unit_price: batch.unit_price,
                    expiry_date: batch.expiry_date || null,
                }], "id");
            }
        }
    }

    return { success: true };
}
