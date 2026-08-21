// Pure evaluator over the already-loaded, already-normalized `rooms`
// snapshot (via buildInventorySnapshot — see ../utils/inventorySnapshot.ts).
// No Supabase query here — see expiredInventoryProvider.ts for the shared
// design rationale.
//
// Eligibility: usableQuantity between 1 and LOW_STOCK_THRESHOLD (10)
// inclusive, AND not already Expired. An Out-of-Stock item (quantity 0) is
// never eligible here — Out of Stock and Low Stock are mutually exclusive
// by construction (0 fails `>= 1`). An Expired item is also excluded
// (`expiredBatch === null` required) so an item never wins Low Stock while
// its authoritative stock is actually unusable due to expiry.

import type { InsightCandidate } from '../contracts/insightCandidate';
import type { InventorySnapshotItem } from '../utils/inventorySnapshot';

export const LOW_STOCK_THRESHOLD = 10;

export interface LowStockInventoryFacts {
  itemId: string;
  itemName: string | null;
  quantity: number;
  threshold: number;
}

function safeItemName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Deterministic same-type tie-break: lowest usableQuantity first (the
 *  most depleted item wins), then item `createdAt`, then item id. Never
 *  array/object iteration order. */
function compareForSelection(a: InventorySnapshotItem, b: InventorySnapshotItem): number {
  if (a.usableQuantity !== b.usableQuantity) return a.usableQuantity - b.usableQuantity;

  const aCreated = a.createdAt ?? '';
  const bCreated = b.createdAt ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

function buildCandidateFromItem(winner: InventorySnapshotItem): InsightCandidate<LowStockInventoryFacts> {
  const safeName = safeItemName(winner.itemName);
  const message = safeName
    ? `${safeName} is running low with ${winner.usableQuantity} remaining.`
    : `An inventory item is running low with ${winner.usableQuantity} remaining.`;

  const facts: LowStockInventoryFacts = {
    itemId: winner.itemId,
    itemName: safeName,
    quantity: winner.usableQuantity,
    threshold: LOW_STOCK_THRESHOLD,
  };

  return {
    app: 'inventory',
    triggerId: 'inventory_low_stock',
    priority: 'MEDIUM',
    facts,
    messageTemplate: '{itemName} is running low with {quantity} remaining.',
    message,
    action: { label: 'View Low Stock', view: 'inventory' },
    dedupeKey: `inventory_low_stock:${winner.itemId}:quantity:${winner.usableQuantity}:threshold${LOW_STOCK_THRESHOLD}`,
    sourceRecordId: winner.itemId,
    evaluatedAt: new Date().toISOString(),
  };
}

function qualifyingLowStock(snapshot: InventorySnapshotItem[]): InventorySnapshotItem[] {
  return snapshot.filter((i) => i.usableQuantity >= 1 && i.usableQuantity <= LOW_STOCK_THRESHOLD && i.expiredBatch === null);
}

export function evaluateLowStock(snapshot: InventorySnapshotItem[]): InsightCandidate<LowStockInventoryFacts> | null {
  const qualifying = qualifyingLowStock(snapshot);
  if (qualifying.length === 0) return null;

  const winner = [...qualifying].sort(compareForSelection)[0];
  return buildCandidateFromItem(winner);
}

/** Additive ordered pool — see expiredInventoryProvider.ts's
 *  evaluateExpiredInventoryCandidates for the same design intent.
 *  `evaluateLowStockCandidates(snapshot)[0]` is always identical to
 *  `evaluateLowStock(snapshot)`. */
export function evaluateLowStockCandidates(snapshot: InventorySnapshotItem[]): InsightCandidate<LowStockInventoryFacts>[] {
  return [...qualifyingLowStock(snapshot)].sort(compareForSelection).map(buildCandidateFromItem);
}
