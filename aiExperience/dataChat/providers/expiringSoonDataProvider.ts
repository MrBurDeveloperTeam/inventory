// Pure evaluator over the already-built Inventory snapshot (see
// ../../utils/inventorySnapshot.ts). No Supabase query here.
//
// Eligibility and date semantics mirror expiringSoonInventoryProvider.ts
// exactly: not already expired, has a qualifying upcoming batch, and that
// batch's day-distance from today (via the existing `daysBetweenDateKeys`/
// `toCalendarDateKey` local-date-key helpers — never a UTC-shift-prone
// `new Date(dateString)` comparison) is within `[0, EXPIRING_SOON_WINDOW_DAYS]`
// inclusive. `EXPIRING_SOON_WINDOW_DAYS` is imported from that same
// existing Phase-2A provider — never redefined here.
//
// QUANTITY DELIBERATELY OMITTED — same reasoning as expiredDataProvider.ts:
// the item's total `usableQuantity` is not the same thing as "how much of
// this item is in the specific expiring batch," and that distinction
// matters more in a direct chat answer than a proactive banner line.

import { daysBetweenDateKeys, toCalendarDateKey } from '../../utils/dateUtils';
import { EXPIRING_SOON_WINDOW_DAYS } from '../../providers/expiringSoonInventoryProvider';
import type { InventorySnapshotItem } from '../../utils/inventorySnapshot';
import { MAX_LIST_ITEMS, safeItemName, resolveRoomName } from '../utils/dataChatHelpers';

export interface ExpiringSoonDataItemFact {
  itemId: string;
  itemName: string;
  roomId: string;
  roomName: string;
  expiryDate: string;
  daysRemaining: number;
}

export interface ExpiringSoonDataFacts {
  windowDays: number;
  count: number;
  shownCount: number;
  items: ExpiringSoonDataItemFact[];
}

interface ExpiringSoonSource {
  item: InventorySnapshotItem;
  daysRemaining: number;
}

/** Deterministic ordering: fewest days remaining first (closest expiry
 *  first), then `roomId`, then `itemId` — stable, never array/object
 *  iteration order. `roomId` is included explicitly so ordering stays
 *  unambiguous at the actual `(room, item)` result granularity this list
 *  represents. */
function compareForOrdering(a: ExpiringSoonSource, b: ExpiringSoonSource): number {
  if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;
  if (a.item.roomId !== b.item.roomId) return a.item.roomId < b.item.roomId ? -1 : 1;
  return a.item.itemId < b.item.itemId ? -1 : a.item.itemId > b.item.itemId ? 1 : 0;
}

export function buildExpiringSoonDataFacts(
  snapshot: InventorySnapshotItem[],
  roomNames: Map<string, string>,
  now: Date = new Date()
): ExpiringSoonDataFacts {
  const todayKey = toCalendarDateKey(now);

  const sources: ExpiringSoonSource[] = [];
  for (const item of snapshot) {
    // Same anomaly-safety reasoning as expiringSoonInventoryProvider.ts:
    // `usableQuantity <= 0` (including a negative anomaly) never
    // qualifies, even if an individual batch's own qty is positive.
    if (item.usableQuantity <= 0) continue;
    if (item.expiredBatch !== null) continue;
    if (item.upcomingExpiryBatch === null) continue;

    const daysRemaining = daysBetweenDateKeys(todayKey, item.upcomingExpiryBatch.expiryDate);
    if (daysRemaining < 0 || daysRemaining > EXPIRING_SOON_WINDOW_DAYS) continue;

    sources.push({ item, daysRemaining });
  }

  const ordered = [...sources].sort(compareForOrdering);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  return {
    windowDays: EXPIRING_SOON_WINDOW_DAYS,
    count: sources.length,
    shownCount: shown.length,
    items: shown.map(({ item, daysRemaining }) => ({
      itemId: item.itemId,
      itemName: safeItemName(item.itemName),
      roomId: item.roomId,
      roomName: resolveRoomName(roomNames, item.roomId),
      // Non-null: `upcomingExpiryBatch !== null` already required above.
      expiryDate: item.upcomingExpiryBatch!.expiryDate,
      daysRemaining,
    })),
  };
}
