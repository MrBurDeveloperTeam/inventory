// Grounded conversational follow-up resolver — Tier C of the 5-tier
// routing model. Tried ONLY when classifyInventoryDataIntent(msg)
// returned `no_match` AND an active GroundedConversationContext exists
// from a prior item-list grounded answer (expired/out-of-stock/
// low-stock/expiring-soon). See Todo's resolveTodoFollowUp.ts for the
// full design rationale — same pattern, ported to Inventory's own item
// shape (itemId/itemName/roomId/roomName — itemName is already
// model-safe here, no separate local-only display layer needed, unlike
// Todo's task titles).
//
// REVALIDATION: every follow-up re-resolves the SAME `lastIntent`
// against the CURRENT live `rooms` array via the existing
// `resolveInventoryDataQuery` — never a cached snapshot.

import { resolveInventoryDataQuery } from '../resolver/resolveInventoryDataQuery';
import type { GroundedConversationContext } from '../context/groundedConversationContext';
import type { InventoryDataIntent } from '../contracts/groundedDataResult';
import type { Room } from '../../../types';

const LIST_INTENTS: ReadonlySet<InventoryDataIntent> = new Set([
  'inventory_expired',
  'inventory_out_of_stock',
  'inventory_low_stock',
  'inventory_expiring_soon',
]);

interface InventoryItemFact {
  itemId: string;
  itemName: string;
  roomId: string;
  roomName: string;
}

interface InventoryListFacts {
  count: number;
  shownCount: number;
  items: InventoryItemFact[];
}

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsAny(msg: string, phrases: string[]): boolean {
  return phrases.some((p) => msg.includes(p));
}

const RESTOCK_FIRST_PHRASES = [
  'which should i restock first',
  'what should i restock first',
  'which one should i restock first',
  'what should i order first',
  'which is most urgent',
  'what should i prioritize',
];
const WHY_PHRASES = ['why', 'why that one', 'why is that'];
const ROOM_BREAKDOWN_PHRASES = [
  'which room has the most',
  'what room has the most',
  'which room',
  'by room',
];
const COUNT_PHRASES = ['how many of those', 'how many of them', 'how many are there'];

const ORDINAL_WORDS: Array<[string, number]> = [
  ['first', 0],
  ['second', 1],
  ['third', 2],
  ['fourth', 3],
  ['fifth', 4],
  ['last', -1],
];

function detectOrdinalIndex(msg: string, listLength: number): number | null {
  for (const [word, idx] of ORDINAL_WORDS) {
    if (msg.includes(word)) {
      if (idx === -1) return listLength > 0 ? listLength - 1 : null;
      return idx;
    }
  }
  return null;
}

export interface InventoryFollowUpAnswer {
  text: string;
  presentedOrder: 'display' | 'ranked';
}

export function resolveInventoryFollowUp(
  message: string,
  context: GroundedConversationContext | null,
  rooms: Room[],
  isLoadingMain: boolean
): InventoryFollowUpAnswer | null {
  if (!context || !LIST_INTENTS.has(context.lastIntent)) return null;

  const msg = normalize(message);
  if (!msg) return null;

  const result = resolveInventoryDataQuery(context.lastIntent, rooms, isLoadingMain);
  if (result.status !== 'ok') return null;

  const facts = result.facts as InventoryListFacts;
  if (facts.items.length === 0) return null;

  // Already ordered oldest-standing-problem-first by the provider (see
  // its own `compareForOrdering`) — the most natural "restock first"
  // reading without inventing a new urgency score.
  const displayOrder = facts.items;

  if (mentionsAny(msg, RESTOCK_FIRST_PHRASES)) {
    const top = displayOrder[0];
    return {
      text: `I'd restock "${top.itemName}" in ${top.roomName} first — it's been on this list the longest.`,
      presentedOrder: 'ranked',
    };
  }

  if (WHY_PHRASES.includes(msg) || msg.startsWith('why ')) {
    const top = displayOrder[0];
    return {
      text: `"${top.itemName}" in ${top.roomName} has been on this list the longest, so it's the one most worth addressing first.`,
      presentedOrder: context.presentedOrder,
    };
  }

  if (mentionsAny(msg, ROOM_BREAKDOWN_PHRASES)) {
    const byRoom = new Map<string, number>();
    for (const item of facts.items) {
      byRoom.set(item.roomName, (byRoom.get(item.roomName) ?? 0) + 1);
    }
    const ranked = [...byRoom.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])));
    const lines = ranked.map(([room, n]) => `${room}: ${n}`);
    const truncationNote = facts.count > facts.shownCount ? ` (based on the ${facts.shownCount} shown of ${facts.count} total)` : '';
    return { text: `By room${truncationNote}:\n${lines.join('\n')}`, presentedOrder: context.presentedOrder };
  }

  if (mentionsAny(msg, COUNT_PHRASES)) {
    return { text: `There are ${facts.count} item${facts.count === 1 ? '' : 's'} on that list.`, presentedOrder: context.presentedOrder };
  }

  const idx = detectOrdinalIndex(msg, displayOrder.length);
  if (idx !== null) {
    if (idx < 0 || idx >= displayOrder.length) {
      return {
        text: `I only have ${displayOrder.length} item${displayOrder.length === 1 ? '' : 's'} in view right now.`,
        presentedOrder: context.presentedOrder,
      };
    }
    const item = displayOrder[idx];
    return { text: `"${item.itemName}" is in ${item.roomName}.`, presentedOrder: context.presentedOrder };
  }

  return null;
}
