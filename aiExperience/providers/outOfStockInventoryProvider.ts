// Pure evaluator over the already-loaded, already-normalized `rooms` state
// (via buildInventorySnapshot — see ../utils/inventorySnapshot.ts). No
// Supabase query here — see expiredInventoryProvider.ts for the shared
// design rationale.
//
// Eligibility: usable quantity === 0 (summed across all of an item's
// batches — see inventorySnapshot.ts). An item with usable quantity 0 is
// never also eligible for Expired Inventory: evaluateExpiredInventory
// requires `usableQuantity > 0`, so the two are mutually exclusive by
// construction — a zero-quantity item with an old expiry date is
// classified Out of Stock only, never Expired (see the implementation
// report's "Expired vs Out-of-Stock Exclusivity" section for the full
// reasoning and Case D of the behavior matrix).

import type { InsightCandidate } from '../contracts/insightCandidate';
import type { InventorySnapshotItem } from '../utils/inventorySnapshot';

export interface OutOfStockInventoryFacts {
  itemId: string;
  itemName: string | null;
  quantity: 0;
}

function safeItemName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Deterministic same-type tie-break when multiple items qualify: item
 *  `createdAt`, then item id. Never array/object iteration order. */
function compareForSelection(a: InventorySnapshotItem, b: InventorySnapshotItem): number {
  const aCreated = a.createdAt ?? '';
  const bCreated = b.createdAt ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

function buildCandidateFromItem(winner: InventorySnapshotItem): InsightCandidate<OutOfStockInventoryFacts> {
  const safeName = safeItemName(winner.itemName);
  const message = safeName ? `${safeName} is out of stock.` : 'An inventory item is out of stock.';

  const facts: OutOfStockInventoryFacts = {
    itemId: winner.itemId,
    itemName: safeName,
    quantity: 0,
  };

  return {
    app: 'inventory',
    triggerId: 'inventory_out_of_stock',
    priority: 'HIGH',
    facts,
    messageTemplate: '{itemName} is out of stock.',
    message,
    action: { label: 'View Out of Stock', view: 'inventory' },
    dedupeKey: `inventory_out_of_stock:${winner.itemId}`,
    sourceRecordId: winner.itemId,
    evaluatedAt: new Date().toISOString(),
  };
}

export function evaluateOutOfStock(snapshot: InventorySnapshotItem[]): InsightCandidate<OutOfStockInventoryFacts> | null {
  const qualifying = snapshot.filter((i) => i.usableQuantity === 0);
  if (qualifying.length === 0) return null;

  const winner = [...qualifying].sort(compareForSelection)[0];
  return buildCandidateFromItem(winner);
}

/** Additive ordered pool — see expiredInventoryProvider.ts's
 *  evaluateExpiredInventoryCandidates for the same design intent.
 *  `evaluateOutOfStockCandidates(snapshot)[0]` is always identical to
 *  `evaluateOutOfStock(snapshot)`. */
export function evaluateOutOfStockCandidates(snapshot: InventorySnapshotItem[]): InsightCandidate<OutOfStockInventoryFacts>[] {
  const qualifying = snapshot.filter((i) => i.usableQuantity === 0);
  return [...qualifying].sort(compareForSelection).map(buildCandidateFromItem);
}
