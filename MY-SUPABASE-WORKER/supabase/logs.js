import { sbInsert } from "./rest.js";

/**
 * Insert an activity log entry
 */
export async function insertLog(env, logData) {
    await sbInsert(env, "inventory_activity_logs", [{
        id: logData.id,
        user_id: logData.user_id,
        room_id: logData.room_id,
        room_name: logData.room_name,
        action: logData.action,
        details: logData.details,
        created_at: logData.created_at,
        actor_id: logData.actor_id || null,
        before_value: logData.before_value || null,
        after_value: logData.after_value || null,
    }]);
    return logData;
}
