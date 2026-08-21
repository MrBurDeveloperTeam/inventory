// Pure evaluator over the already-loaded, already-normalized `rooms`
// snapshot (via buildInventorySnapshot — see ../utils/inventorySnapshot.ts).
// No Supabase query here — see expiredInventoryProvider.ts for the shared
// design rationale.
//
// Inventory Summary is the final, non-urgent candidate — only reached by
// the resolver when Expired/Out of Stock/Low Stock/Expiring Soon all
// produced no winner. It re-derives its own ordered, mutually-exclusive
// per-item classification from the SAME snapshot (never a second raw
// traversal of `rooms`, never re-implementing batch/expiry logic) so every
// item is counted in exactly one bucket — this is intentionally a
// self-contained classification pass, not a call into the other four
// providers per item, because those providers each select a single GLOBAL
// winner (with their own tie-break), not a per-item bucket assignment.

import { daysBetweenDateKeys, toCalendarDateKey } from '../utils/dateUtils';
import { LOW_STOCK_THRESHOLD } from './lowStockInventoryProvider';
import { EXPIRING_SOON_WINDOW_DAYS } from './expiringSoonInventoryProvider';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { InventorySnapshotItem } from '../utils/inventorySnapshot';

export interface InventorySummaryFacts {
  itemCount: number;
  totalQuantity: number;
  healthyCount: number;
  expiredCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  expiringSoonCount: number;
}

export type StatusBucket = 'ANOMALY' | 'EXPIRED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'EXPIRING_SOON' | 'HEALTHY';

/**
 * Ordered, mutually-exclusive classification — matches the exact priority
 * order the other four providers already use, so summary counts can never
 * disagree with what a real alert candidate would have selected. `ANOMALY`
 * (negative usableQuantity) is checked first and deliberately does NOT fall
 * through to any other bucket — per the task's explicit safety rule, Out of
 * Stock stays exact-zero semantics (never silently redefined to `<= 0`),
 * so a negative quantity is neither "out of stock" nor "healthy"; it's
 * tracked separately so the caller can refuse to produce a false positive
 * summary rather than mask the anomaly as good news.
 *
 * Exported (Phase-3 addition — purely additive, no behavior change) so
 * aiExperience/dataChat/providers/summaryDataProvider.ts can reuse this
 * exact classification instead of reimplementing a second copy of it.
 */
export function classifyItem(item: InventorySnapshotItem, todayKey: string): StatusBucket {
  if (item.usableQuantity < 0) return 'ANOMALY';
  if (item.usableQuantity > 0 && item.expiredBatch !== null) return 'EXPIRED';
  if (item.usableQuantity === 0) return 'OUT_OF_STOCK';
  if (item.usableQuantity >= 1 && item.usableQuantity <= LOW_STOCK_THRESHOLD) return 'LOW_STOCK';

  if (item.upcomingExpiryBatch !== null) {
    const days = daysBetweenDateKeys(todayKey, item.upcomingExpiryBatch.expiryDate);
    if (days >= 0 && days <= EXPIRING_SOON_WINDOW_DAYS) return 'EXPIRING_SOON';
  }

  return 'HEALTHY';
}

export function evaluateInventorySummary(
  snapshot: InventorySnapshotItem[],
  now: Date = new Date()
): InsightCandidate<InventorySummaryFacts> | null {
  // Empty inventory: no existing "N items tracked" empty-state copy was
  // found anywhere in this app's current UI to align with (MasterInventory/
  // ClinicMap have no such message today) — rather than invent new
  // user-facing wording, this returns no candidate at all, consistent with
  // the same "don't fabricate a positive claim" principle applied to the
  // loading/error/anomaly cases below. The existing dashboard's own empty
  // room/item UI (unchanged by this feature) remains the only messaging
  // for this case.
  if (snapshot.length === 0) return null;

  const todayKey = toCalendarDateKey(now);

  let totalQuantity = 0;
  let healthyCount = 0;
  let expiredCount = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;
  let expiringSoonCount = 0;
  let anomalyCount = 0;

  for (const item of snapshot) {
    totalQuantity += item.usableQuantity;
    switch (classifyItem(item, todayKey)) {
      case 'ANOMALY':
        anomalyCount += 1;
        break;
      case 'EXPIRED':
        expiredCount += 1;
        break;
      case 'OUT_OF_STOCK':
        outOfStockCount += 1;
        break;
      case 'LOW_STOCK':
        lowStockCount += 1;
        break;
      case 'EXPIRING_SOON':
        expiringSoonCount += 1;
        break;
      case 'HEALTHY':
        healthyCount += 1;
        break;
    }
  }

  // A negative-quantity anomaly means the authoritative state itself can't
  // be trusted enough to make any positive claim — never fabricate
  // "inventory looks healthy" over an unexplained anomaly. No visible
  // "Negative Inventory" alert is created either; this simply withholds
  // the Summary candidate for this evaluation.
  if (anomalyCount > 0) return null;

  const itemCount = snapshot.length;
  const message = `Inventory is up to date across ${itemCount} tracked item${itemCount === 1 ? '' : 's'}.`;

  const facts: InventorySummaryFacts = {
    itemCount,
    totalQuantity,
    healthyCount,
    expiredCount,
    outOfStockCount,
    lowStockCount,
    expiringSoonCount,
  };

  return {
    app: 'inventory',
    triggerId: 'inventory_summary',
    priority: 'INFO',
    facts,
    messageTemplate: 'Inventory is up to date across {itemCount} tracked items.',
    message,
    action: { label: 'View Inventory', view: 'inventory' },
    dedupeKey: `inventory_summary:${todayKey}:count:${itemCount}`,
    // Aggregate — no single backing record.
    sourceRecordId: null,
    evaluatedAt: new Date().toISOString(),
  };
}
