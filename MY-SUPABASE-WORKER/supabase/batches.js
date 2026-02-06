import { sbDelete, sbUpsert } from "./rest.js";

/**
 * Upsert a batch
 */
export async function upsertBatch(env, batchData) {
    await sbUpsert(env, "inventory_item_batches", [{
        id: batchData.id,
        item_id: batchData.item_id,
        qty: batchData.qty,
        unit_price: batchData.unit_price,
        expiry_date: batchData.expiry_date || null,
    }], "id");
    return batchData;
}

/**
 * Delete a batch by ID
 */
export async function deleteBatch(env, batchId) {
    await sbDelete(env, "inventory_item_batches", { id: `eq.${batchId}` });
    return { deleted: true };
}

/**
 * Delete all batches for an item
 */
export async function deleteBatchesByItemId(env, itemId) {
    await sbDelete(env, "inventory_item_batches", { item_id: `eq.${itemId}` });
    return { deleted: true };
}

/**
 * Update batch and optionally update parent item summary
 */
export async function updateBatchWithItemSync(env, payload) {
    const { batch, itemUpdate } = payload;

    // 1. Update/delete the batch
    if (batch.qty <= 0) {
        await deleteBatch(env, batch.id);
    } else {
        await upsertBatch(env, batch);
    }

    // 2. Update parent item summary if provided
    if (itemUpdate) {
        const url = `${env.SUPABASE_URL}/rest/v1/inventory_items?id=eq.${itemUpdate.id}`;

        const res = await fetch(url, {
            method: "PATCH",
            headers: {
                apikey: env.SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
            },
            body: JSON.stringify({
                quantity: itemUpdate.quantity,
                price: itemUpdate.price,
                expiry_date: itemUpdate.expiry_date,
            }),
        });

        if (!res.ok) {
            throw new Error(`Failed to update item: ${await res.text()}`);
        }
    }

    return { success: true };
}
