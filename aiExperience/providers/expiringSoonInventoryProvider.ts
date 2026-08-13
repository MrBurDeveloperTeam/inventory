// Pure evaluator over the already-loaded, already-normalized `rooms`
// snapshot (via buildInventorySnapshot — see ../utils/inventorySnapshot.ts).
// No Supabase query here — see expiredInventoryProvider.ts for the shared
// design rationale.
//
// Eligibility: NOT already Expired (`expiredBatch === null`), has a
// qualifying upcoming batch (`upcomingExpiryBatch !== null` — already
// guaranteed qty > 0 and expiry >= today by the snapshot's own
// definition), and that batch's calendar-day distance from today is within
// the 30-day warning window (0–30 inclusive). The snapshot itself is not
// restricted to any window (see inventorySnapshot.ts) — this provider is
// what applies the product rule.
//
// This provider does NOT separately exclude items that also qualify for
// Low Stock. Low Stock > Expiring Soon precedence is enforced entirely by
// the resolver (resolveInventoryInsight.ts checks Low Stock first) — since
// the resolver only ever reaches this provider when Low Stock's own
// evaluation found zero qualifying items globally, there is nothing left
// for this provider to exclude on that basis. (Inventory Summary's
// per-item bucketing is a separate, self-contained classification — see
// inventorySummaryProvider.ts — and does apply that exclusion itself, for
// the different purpose of not double-counting an item in two buckets.)

import { daysBetweenDateKeys, toCalendarDateKey } from '../utils/dateUtils';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { InventorySnapshotItem } from '../utils/inventorySnapshot';

export const EXPIRING_SOON_WINDOW_DAYS = 30;

export interface ExpiringSoonInventoryFacts {
  itemId: string;
  itemName: string | null;
  /** Authoritative usable quantity for the item (same value the snapshot
   *  and every other provider use) — not the expiring batch's own qty,
   *  which may be only part of the item's total stock. */
  quantity: number;
  expiryDate: string;
  daysRemaining: number;
  windowDays: number;
  batchId?: string;
}

function safeItemName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildMessage(safeName: string | null, daysRemaining: number): string {
  if (daysRemaining === 0) {
    return safeName ? `${safeName} expires today.` : 'An inventory item expires today.';
  }
  if (daysRemaining === 1) {
    return safeName ? `${safeName} expires in 1 day.` : 'An inventory item expires in 1 day.';
  }
  return safeName
    ? `${safeName} will expire in ${daysRemaining} days.`
    : `An inventory item will expire in ${daysRemaining} days.`;
}

interface ExpiringSoonSource {
  item: InventorySnapshotItem;
  daysRemaining: number;
}

/** Deterministic same-type tie-break: smallest daysRemaining (closest
 *  expiry wins), then item `createdAt`, then item id. Never array/object
 *  iteration order. */
function compareForSelection(a: ExpiringSoonSource, b: ExpiringSoonSource): number {
  if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining;

  const aCreated = a.item.createdAt ?? '';
  const bCreated = b.item.createdAt ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  return a.item.itemId < b.item.itemId ? -1 : a.item.itemId > b.item.itemId ? 1 : 0;
}

export function evaluateExpiringSoon(
  snapshot: InventorySnapshotItem[],
  now: Date = new Date()
): InsightCandidate<ExpiringSoonInventoryFacts> | null {
  const todayKey = toCalendarDateKey(now);

  const sources: ExpiringSoonSource[] = [];
  for (const item of snapshot) {
    // Explicit — `upcomingExpiryBatch !== null` only proves at least one
    // individual batch has qty > 0; it does not mathematically guarantee
    // the item's total `usableQuantity` is positive, since a malformed/
    // anomalous negative-quantity batch elsewhere on the same item could
    // still drag the sum to zero or below. Inventory Summary already
    // treats `usableQuantity < 0` as an anomaly and refuses a positive
    // claim — this keeps Expiring Soon consistent with that same safety
    // model rather than surfacing a "expiring soon" alert for stock that
    // isn't actually usable.
    if (item.usableQuantity <= 0) continue;
    if (item.expiredBatch !== null) continue;
    if (item.upcomingExpiryBatch === null) continue;

    const daysRemaining = daysBetweenDateKeys(todayKey, item.upcomingExpiryBatch.expiryDate);
    if (daysRemaining < 0 || daysRemaining > EXPIRING_SOON_WINDOW_DAYS) continue;

    sources.push({ item, daysRemaining });
  }

  if (sources.length === 0) return null;

  const winner = [...sources].sort(compareForSelection)[0];
  const upcoming = winner.item.upcomingExpiryBatch as NonNullable<InventorySnapshotItem['upcomingExpiryBatch']>;
  const safeName = safeItemName(winner.item.itemName);
  const message = buildMessage(safeName, winner.daysRemaining);

  const facts: ExpiringSoonInventoryFacts = {
    itemId: winner.item.itemId,
    itemName: safeName,
    quantity: winner.item.usableQuantity,
    expiryDate: upcoming.expiryDate,
    daysRemaining: winner.daysRemaining,
    windowDays: EXPIRING_SOON_WINDOW_DAYS,
    batchId: upcoming.batchId,
  };

  return {
    app: 'inventory',
    triggerId: 'inventory_expiring_soon',
    priority: 'LOW',
    facts,
    messageTemplate: '{itemName} will expire in {daysRemaining} days.',
    message,
    dedupeKey: `inventory_expiring_soon:${winner.item.itemId}:batch:${upcoming.batchId}:${upcoming.expiryDate}:window${EXPIRING_SOON_WINDOW_DAYS}`,
    sourceRecordId: winner.item.itemId,
    evaluatedAt: new Date().toISOString(),
  };
}
