// Pure evaluator over the already-built Inventory snapshot (see
// ../../utils/inventorySnapshot.ts). No Supabase query here.
//
// Eligibility mirrors lowStockInventoryProvider.ts exactly:
// `usableQuantity` in `[1, LOW_STOCK_THRESHOLD]` AND not already expired
// (`expiredBatch === null`). `LOW_STOCK_THRESHOLD` is imported from that
// same existing Phase-2A provider — never redefined here — so Data-Driven
// Chat can never silently drift from the validated v1 threshold of 10.
// An Out-of-Stock item (`usableQuantity === 0`) fails the `>= 1` check
// and is never eligible — Out of Stock and Low Stock stay mutually
// exclusive exactly as Phase-2A already established.
//
// `quantity` here IS included (unlike Expired/Expiring Soon) — it is the
// item's authoritative total `usableQuantity`, the exact same number the
// existing Low Stock Personalized Insight itself uses; no ambiguity
// between "total" and "a specific batch's own quantity" exists for this
// intent, since Low Stock is inherently about the item's total usable
// stock level.

import { LOW_STOCK_THRESHOLD } from '../../providers/lowStockInventoryProvider';
import type { InventorySnapshotItem } from '../../utils/inventorySnapshot';
import { MAX_LIST_ITEMS, safeItemName, resolveRoomName } from '../utils/dataChatHelpers';

export interface LowStockDataItemFact {
  itemId: string;
  itemName: string;
  roomId: string;
  roomName: string;
  quantity: number;
}

export interface LowStockDataFacts {
  threshold: number;
  count: number;
  shownCount: number;
  items: LowStockDataItemFact[];
}

/** Deterministic ordering: lowest usable quantity first (most depleted
 *  item first), then `roomId`, then `itemId` — stable, never array/object
 *  iteration order or item display name as the sole tie-break. `roomId`
 *  is included explicitly so ordering stays unambiguous at the actual
 *  `(room, item)` result granularity this list represents. */
function compareForOrdering(a: InventorySnapshotItem, b: InventorySnapshotItem): number {
  if (a.usableQuantity !== b.usableQuantity) return a.usableQuantity - b.usableQuantity;
  if (a.roomId !== b.roomId) return a.roomId < b.roomId ? -1 : 1;
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

export function buildLowStockDataFacts(
  snapshot: InventorySnapshotItem[],
  roomNames: Map<string, string>
): LowStockDataFacts {
  const qualifying = snapshot.filter(
    (item) => item.usableQuantity >= 1 && item.usableQuantity <= LOW_STOCK_THRESHOLD && item.expiredBatch === null
  );
  const ordered = [...qualifying].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  return {
    threshold: LOW_STOCK_THRESHOLD,
    count: qualifying.length,
    shownCount: shown.length,
    items: shown.map((item) => ({
      itemId: item.itemId,
      itemName: safeItemName(item.itemName),
      roomId: item.roomId,
      roomName: resolveRoomName(roomNames, item.roomId),
      quantity: item.usableQuantity,
    })),
  };
}
