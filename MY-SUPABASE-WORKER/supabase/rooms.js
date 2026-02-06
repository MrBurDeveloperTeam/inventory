import { sbInsert, sbDelete } from "./rest.js";

/**
 * Create a new room
 */
export async function createRoom(env, { user_id, id, name, pos_x, pos_y }) {
    await sbInsert(env, "inventory_rooms", [{
        id,
        user_id,
        name,
        pos_x,
        pos_y,
    }]);
    return { id, name, pos_x, pos_y };
}

/**
 * Delete a room and cascade delete its items + batches
 */
export async function deleteRoom(env, roomId) {
    // 1. Get all items in this room
    const itemsUrl = `${env.SUPABASE_URL}/rest/v1/inventory_items?room_id=eq.${roomId}&select=id`;
    const itemsRes = await fetch(itemsUrl, {
        headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
    });

    if (!itemsRes.ok) {
        throw new Error(`Failed to fetch items: ${await itemsRes.text()}`);
    }

    const items = await itemsRes.json();
    const itemIds = items.map(i => i.id);

    // 2. Delete batches for those items
    if (itemIds.length > 0) {
        await sbDelete(env, "inventory_item_batches", {
            item_id: `in.(${itemIds.join(",")})`,
        });

        // 3. Delete items
        await sbDelete(env, "inventory_items", {
            id: `in.(${itemIds.join(",")})`,
        });
    }

    // 4. Delete the room
    await sbDelete(env, "inventory_rooms", { id: `eq.${roomId}` });

    return { deleted: true };
}

/**
 * Update room properties (name, position)
 */
export async function updateRoom(env, roomId, updates) {
    const url = `${env.SUPABASE_URL}/rest/v1/inventory_rooms?id=eq.${roomId}`;

    const body = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.pos_x !== undefined) body.pos_x = updates.pos_x;
    if (updates.pos_y !== undefined) body.pos_y = updates.pos_y;

    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`Failed to update room: ${await res.text()}`);
    }

    return { updated: true };
}
