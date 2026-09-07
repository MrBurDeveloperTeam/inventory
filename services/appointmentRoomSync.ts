import { supabase } from '../supabaseClient';

/**
 * appointmentRoomSync.ts
 *
 * Keeps inventory_rooms and apt_rooms in sync.
 *
 * Both apps share the same Supabase project in production
 * (opdotszsldcgwjqtvgul.supabase.co). The shared link is:
 *
 *   inventory_rooms.user_id
 *     → profiles.user_id
 *       → profiles.clinic_id
 *         → apt_rooms.clinic_id
 *
 * Rooms created from inventory use the SAME UUID in both tables so
 * cross-app renames can be done with a simple .eq('id', roomId)
 * — no extra columns needed.
 */

/** Resolve clinic_id for a given inventory owner (user_id). */
async function getClinicId(ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('user_id', ownerId)
    .maybeSingle();

  if (error) {
    console.error('[RoomSync] Failed to look up clinic_id:', error.message);
    return null;
  }
  return data?.clinic_id ?? null;
}

/**
 * Called after a room is created in inventory_rooms.
 * Inserts a matching row into apt_rooms using the same UUID.
 * Safe to call multiple times — duplicate inserts are silently ignored.
 */
export async function syncRoomCreatedToAppointment(
  ownerId: string,
  roomId: string,
  roomName: string
): Promise<void> {
  const clinicId = await getClinicId(ownerId);
  if (!clinicId) {
    console.warn('[RoomSync] No clinic_id found for owner', ownerId, '— skipping apt_rooms insert');
    return;
  }

  const { error } = await supabase.from('apt_rooms').insert({
    id: roomId,
    clinic_id: clinicId,
    name: roomName,
    color: '#4A90A4',
  });

  if (error) {
    // 23505 = unique_violation: room already exists — safe to ignore
    if (error.code !== '23505') {
      console.error('[RoomSync] Failed to create apt_room:', error.message);
    }
  }
}

/**
 * Called after a room is renamed in inventory_rooms.
 * Updates the matching apt_rooms row by the shared UUID.
 * No-ops silently if no apt_room exists with that id yet.
 */
export async function syncRoomRenamedToAppointment(
  roomId: string,
  newName: string
): Promise<void> {
  const { error } = await supabase
    .from('apt_rooms')
    .update({ name: newName })
    .eq('id', roomId);

  if (error) {
    console.error('[RoomSync] Failed to rename apt_room:', error.message);
  }
}

/**
 * Called after a room is deleted from inventory_rooms.
 * Deletes the matching apt_rooms row by the shared UUID.
 * No-ops silently if no matching apt_room exists.
 */
export async function syncRoomDeletedFromAppointment(
  roomId: string
): Promise<void> {
  const { error } = await supabase
    .from('apt_rooms')
    .delete()
    .eq('id', roomId);

  if (error) {
    console.error('[RoomSync] Failed to delete apt_room:', error.message);
  }
}
