// Pure evaluator over the already-built Inventory snapshot (see
// ../../utils/inventorySnapshot.ts). No Supabase query here.
//
// Reuses `classifyItem` (../../providers/inventorySummaryProvider.ts) —
// the EXACT same ordered, mutually-exclusive per-item bucketing Phase-2A's
// Inventory Summary Personalized Insight already uses — rather than a
// second, independently-drifting implementation. Every count below comes
// from that one classification pass.
//
// EMPTY vs. ANOMALY, a deliberate difference from Phase-2A's own
// `evaluateInventorySummary` (which returns `null`/no-candidate for BOTH
// an empty snapshot and an anomaly — appropriate there, since a proactive
// banner should never volunteer "0 items tracked" unprompted). Data-Driven
// Chat is different: the user explicitly ASKED "how much inventory do I
// have" — a genuinely empty inventory deserves a truthful direct "0 items"
// answer, not silence. An ANOMALY (negative usableQuantity present),
// however, means the authoritative state itself can't be trusted enough
// for ANY positive claim (including a zero/total-quantity claim) — that
// case returns the `'anomaly'` sentinel, which the resolver maps to
// `status: 'unavailable'` (see ../resolver/resolveInventoryDataQuery.ts),
// never a fabricated zero.

import { toCalendarDateKey } from '../../utils/dateUtils';
import { classifyItem } from '../../providers/inventorySummaryProvider';
import type { InventorySnapshotItem } from '../../utils/inventorySnapshot';

export interface SummaryDataFacts {
  itemCount: number;
  totalQuantity: number;
  expiredCount: number;
  outOfStockCount: number;
  lowStockCount: number;
  expiringSoonCount: number;
  healthyCount: number;
}

export function buildSummaryDataFacts(
  snapshot: InventorySnapshotItem[],
  now: Date = new Date()
): SummaryDataFacts | 'anomaly' {
  const todayKey = toCalendarDateKey(now);

  let totalQuantity = 0;
  let expiredCount = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;
  let expiringSoonCount = 0;
  let healthyCount = 0;
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

  if (anomalyCount > 0) return 'anomaly';

  return {
    itemCount: snapshot.length,
    totalQuantity,
    expiredCount,
    outOfStockCount,
    lowStockCount,
    expiringSoonCount,
    healthyCount,
  };
}
