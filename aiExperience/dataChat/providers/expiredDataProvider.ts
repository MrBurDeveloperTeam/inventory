// Pure evaluator over the already-built Inventory snapshot (see
// ../../utils/inventorySnapshot.ts's `buildInventorySnapshot` — the exact
// same helper Phase-2A's Expired Inventory Personalized Insight uses). No
// Supabase query here, no re-implementation of expiry rules.
//
// Eligibility mirrors expiredInventoryProvider.ts exactly:
// `usableQuantity > 0 && expiredBatch !== null`.
//
// QUANTITY DELIBERATELY OMITTED: Personalized Insight's own
// `ExpiredInventoryFacts.quantity` is the item's TOTAL `usableQuantity`
// across every batch, not the specific expired batch's own quantity — an
// ambiguous number in a chat context where a precise "how many expired"
// claim matters more than in a one-line proactive banner. Rather than
// carry that same ambiguity into a user-asked data question, this
// provider omits quantity from v1 facts entirely (per the Phase-3
// readiness pass: "omit quantity from Expired v1 facts... accuracy is
// more important than adding another number").

import type { InventorySnapshotItem } from '../../utils/inventorySnapshot';
import { MAX_LIST_ITEMS, safeItemName, resolveRoomName } from '../utils/dataChatHelpers';

export interface ExpiredDataItemFact {
  itemId: string;
  itemName: string;
  roomId: string;
  roomName: string;
  expiryDate: string;
}

export interface ExpiredDataFacts {
  count: number;
  shownCount: number;
  items: ExpiredDataItemFact[];
}

/** Deterministic ordering: earliest expiry date first, then `roomId`,
 *  then `itemId` — stable across reloads, never array/object iteration
 *  order. `roomId` is included explicitly (not just `itemId` alone) so
 *  ordering stays unambiguous at the actual `(room, item)` result
 *  granularity this list represents, even in the hypothetical case of a
 *  duplicate/non-unique `itemId` across rooms. */
function compareForOrdering(a: InventorySnapshotItem, b: InventorySnapshotItem): number {
  const aExpiry = a.expiredBatch?.expiryDate ?? '';
  const bExpiry = b.expiredBatch?.expiryDate ?? '';
  if (aExpiry !== bExpiry) return aExpiry < bExpiry ? -1 : 1;
  if (a.roomId !== b.roomId) return a.roomId < b.roomId ? -1 : 1;
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

export function buildExpiredDataFacts(
  snapshot: InventorySnapshotItem[],
  roomNames: Map<string, string>
): ExpiredDataFacts {
  const qualifying = snapshot.filter((item) => item.usableQuantity > 0 && item.expiredBatch !== null);
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
      // Non-null: `expiredBatch !== null` was already required by the
      // eligibility filter above.
      expiryDate: item.expiredBatch!.expiryDate,
    })),
  };
}
