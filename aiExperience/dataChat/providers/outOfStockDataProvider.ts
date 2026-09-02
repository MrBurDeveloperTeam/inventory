// Pure evaluator over the already-built Inventory snapshot (see
// ../../utils/inventorySnapshot.ts). No Supabase query here.
//
// Eligibility mirrors outOfStockInventoryProvider.ts exactly:
// `usableQuantity === 0`. Already computed today as part of
// summaryDataProvider.ts's `outOfStockCount` aggregate — this provider
// exposes the actual item LIST behind that same count, reusing the
// identical eligibility rule rather than a second definition.

import type { InventorySnapshotItem } from '../../utils/inventorySnapshot';
import { MAX_LIST_ITEMS, safeItemName, resolveRoomName } from '../utils/dataChatHelpers';

export interface OutOfStockDataItemFact {
  itemId: string;
  itemName: string;
  roomId: string;
  roomName: string;
}

export interface OutOfStockDataFacts {
  count: number;
  shownCount: number;
  items: OutOfStockDataItemFact[];
}

/** Deterministic same-type tie-break: `createdAt` (matches
 *  outOfStockInventoryProvider.ts's own `compareForSelection`), then
 *  `roomId`, then `itemId` — never array/object iteration order. */
function compareForOrdering(a: InventorySnapshotItem, b: InventorySnapshotItem): number {
  const aCreated = a.createdAt ?? '';
  const bCreated = b.createdAt ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;
  if (a.roomId !== b.roomId) return a.roomId < b.roomId ? -1 : 1;
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

export function buildOutOfStockDataFacts(
  snapshot: InventorySnapshotItem[],
  roomNames: Map<string, string>
): OutOfStockDataFacts {
  const qualifying = snapshot.filter((item) => item.usableQuantity === 0);
  const ordered = [...qualifying].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  return {
    count: qualifying.length,
    shownCount: shown.length,
    items: shown.map((item) => ({
      itemId: item.itemId,
      itemName: safeItemName(item.itemName),
      roomId: item.roomId,
      roomName: resolveRoomName(roomNames, item.roomId),
    })),
  };
}
