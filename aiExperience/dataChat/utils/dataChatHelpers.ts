// Small shared helpers for the Data-Driven Chat providers — deliberately
// NOT touching aiExperience/utils/inventorySnapshot.ts (which has no
// `roomName` field, only `roomId` — see that file's own header for why it
// stays minimal). Room-name resolution for chat-facing facts lives here
// instead of widening the shared Phase-2A snapshot type.

import type { Room } from '../../../types';

/** Deterministic maximum number of item rows included in any list-type
 *  grounded answer (Expired / Low Stock / Expiring Soon). Providers
 *  always also return the true `count` alongside `shownCount` so the
 *  response can truthfully communicate truncation — Gemini never decides
 *  this. */
export const MAX_LIST_ITEMS = 5;

/** Same defensive runtime name-safety pattern already used by every
 *  Phase-2A provider (expiredInventoryProvider.ts, lowStockInventoryProvider.ts,
 *  etc.) — `InventorySnapshotItem.itemName` is typed as a plain `string`,
 *  but this guards against a non-string/empty runtime value anyway rather
 *  than trusting the type blindly. */
export function safeItemName(name: unknown): string {
  if (typeof name !== 'string') return 'Unnamed item';
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : 'Unnamed item';
}

/** `roomId -> roomName` lookup built once per query from the same `rooms`
 *  array already loaded in App.tsx — no new Supabase read. A `roomId`
 *  missing from `rooms` (should not happen for a snapshot derived from
 *  the same `rooms` array, but guarded defensively) falls back to a
 *  generic label rather than `undefined`/`null` reaching a chat message. */
export function buildRoomNameLookup(rooms: Room[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const room of rooms) {
    map.set(room.id, room.name);
  }
  return map;
}

export function resolveRoomName(roomNames: Map<string, string>, roomId: string): string {
  return roomNames.get(roomId) ?? 'Unknown Room';
}
