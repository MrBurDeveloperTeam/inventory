// Deterministic, host-only parser for explicit chat-initiated inventory
// mutation commands (Phase INVENTORY-DETERMINISTIC-CONFIRMED-AI-ACTIONS-1).
//
// AUTHORITY MODEL: this module reads ONLY the raw authenticated user's chat
// message and the CURRENT `rooms` snapshot. It never reads Gemini output.
// It never calls Gemini or any other network/LLM service. A non-null
// result is a *proposal* only — nothing here mutates state; the caller is
// responsible for explicit user confirmation and fresh-state revalidation
// (see components/InventoryActionConfirm.tsx) before any executor runs.
//
// STRICT, NOT SMART: only unambiguous, fully-specified commands produce a
// proposal. No fuzzy/semantic matching, no inferred quantities, no
// inferred rooms, no inferred prices. Anything less than fully explicit
// returns null so normal chat (including the existing
// isInventoryMutationRequest refusal) continues to handle the message.

import type { Room, Item } from '../types';

export type PendingInventoryAction =
  | {
      type: 'receive';
      quantity: number;
      price: number;
      itemName: string;
      roomId: string;
      roomName: string;
    }
  | {
      type: 'remove';
      quantity: number;
      itemId: string;
      itemName: string;
      roomId: string;
      roomName: string;
      availableAtProposal: number;
    }
  | {
      type: 'transfer';
      quantity: number;
      itemId: string;
      itemName: string;
      fromRoomId: string;
      fromRoomName: string;
      toRoomId: string;
      toRoomName: string;
      availableAtProposal: number;
    };

// "receive 5 nitrile gloves in Room 1 at 12.50" / "add 5 ... to Room 1 @12.50" / "... for $12.50"
const RECEIVE_RE = /^(?:receive|add)\s+(\d+(?:\.\d+)?)\s+(.+?)\s+(?:to|into|in)\s+(.+?)\s+(?:at|@|for)\s*\$?(\d+(?:\.\d+)?)$/i;
// "remove 2 nitrile gloves from Room 1" / "take out 2 ... from Room 1"
const REMOVE_RE = /^(?:remove|take out)\s+(\d+(?:\.\d+)?)\s+(.+?)\s+from\s+(.+)$/i;
// "transfer 3 nitrile gloves from Room 1 to Room 2" / "move 3 ... from Room 1 to Room 2"
const TRANSFER_RE = /^(?:transfer|move)\s+(\d+(?:\.\d+)?)\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i;

function parsePositiveFiniteQty(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Deterministic, exact (trim + case-insensitive) room lookup. Never
 *  fuzzy. Returns null for zero matches, 'ambiguous' for more than one. */
function findRoomByName(rooms: Room[], text: string): Room | null | 'ambiguous' {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  const matches = rooms.filter((r) => r.name.trim().toLowerCase() === needle);
  if (matches.length === 0) return null;
  if (matches.length > 1) return 'ambiguous';
  return matches[0];
}

/** Deterministic, exact (trim + case-insensitive) item-name lookup scoped
 *  to a single already-resolved room. Never fuzzy. Mirrors the same
 *  matching strategy the existing receiveStock/removeStock/moveItem
 *  executors already use for name-based resolution — not a new rule. */
function findItemByNameInRoom(room: Room, text: string): Item | null | 'ambiguous' {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  const matches = room.items.filter((i) => i.name.trim().toLowerCase() === needle);
  if (matches.length === 0) return null;
  if (matches.length > 1) return 'ambiguous';
  return matches[0];
}

export function parseInventoryActionProposal(message: string, rooms: Room[]): PendingInventoryAction | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  // Transfer is checked first: its "from ... to ..." shape would otherwise
  // be mis-captured by the receive pattern's own "to" clause.
  const transferMatch = trimmed.match(TRANSFER_RE);
  if (transferMatch) {
    const quantity = parsePositiveFiniteQty(transferMatch[1]);
    if (quantity === null) return null;

    const fromRoom = findRoomByName(rooms, transferMatch[3]);
    const toRoom = findRoomByName(rooms, transferMatch[4]);
    if (!fromRoom || fromRoom === 'ambiguous' || !toRoom || toRoom === 'ambiguous') return null;
    if (fromRoom.id === toRoom.id) return null; // same-room transfer: no proposal, deterministic reject

    const item = findItemByNameInRoom(fromRoom, transferMatch[2]);
    if (!item || item === 'ambiguous') return null;
    if (quantity > item.quantity) return null; // insufficient at proposal time — do not even propose

    return {
      type: 'transfer',
      quantity,
      itemId: item.id,
      itemName: item.name,
      fromRoomId: fromRoom.id,
      fromRoomName: fromRoom.name,
      toRoomId: toRoom.id,
      toRoomName: toRoom.name,
      availableAtProposal: item.quantity,
    };
  }

  const receiveMatch = trimmed.match(RECEIVE_RE);
  if (receiveMatch) {
    const quantity = parsePositiveFiniteQty(receiveMatch[1]);
    if (quantity === null) return null;
    const price = parsePositiveFiniteQty(receiveMatch[4]);
    if (price === null) return null;

    const itemName = receiveMatch[2].trim();
    if (!itemName) return null;

    const room = findRoomByName(rooms, receiveMatch[3]);
    if (!room || room === 'ambiguous') return null;

    return {
      type: 'receive',
      quantity,
      price,
      itemName,
      roomId: room.id,
      roomName: room.name,
    };
  }

  const removeMatch = trimmed.match(REMOVE_RE);
  if (removeMatch) {
    const quantity = parsePositiveFiniteQty(removeMatch[1]);
    if (quantity === null) return null;

    const room = findRoomByName(rooms, removeMatch[3]);
    if (!room || room === 'ambiguous') return null;

    const item = findItemByNameInRoom(room, removeMatch[2]);
    if (!item || item === 'ambiguous') return null;
    if (quantity > item.quantity) return null;

    return {
      type: 'remove',
      quantity,
      itemId: item.id,
      itemName: item.name,
      roomId: room.id,
      roomName: room.name,
      availableAtProposal: item.quantity,
    };
  }

  return null;
}
