// Pure evaluator over the already-loaded, already-normalized `rooms` state
// (via buildInventorySnapshot — see ../utils/inventorySnapshot.ts). No
// Supabase query here: App.tsx already owns this state and keeps it current
// through its own existing receive/remove/transfer/realtime handlers.
//
// Eligibility: usable quantity > 0 AND an authoritative (batch-qualifying)
// expiry date strictly before local today. Batch-authoritative semantics
// are already resolved by buildInventorySnapshot — see that file's header
// comment for the full source-proven explanation of why no separate
// "item has zero batches" branch is needed here.

import type { InsightCandidate } from '../contracts/insightCandidate';
import type { InventorySnapshotItem } from '../utils/inventorySnapshot';

export interface ExpiredInventoryFacts {
  itemId: string;
  itemName: string | null;
  quantity: number;
  expiryDate: string;
  batchId?: string;
}

function safeItemName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Deterministic same-type tie-break when multiple items qualify: earliest
 *  expired batch's expiry date first, then item `createdAt` (this repo's
 *  `Item` type has no batch-level `createdAt` — see types.ts — so the
 *  item's own creation time is the available second tiebreaker), then
 *  item id. Never array/object iteration order. */
function compareForSelection(a: InventorySnapshotItem, b: InventorySnapshotItem): number {
  const aExpiry = a.expiredBatch?.expiryDate ?? '';
  const bExpiry = b.expiredBatch?.expiryDate ?? '';
  if (aExpiry !== bExpiry) return aExpiry < bExpiry ? -1 : 1;

  const aCreated = a.createdAt ?? '';
  const bCreated = b.createdAt ?? '';
  if (aCreated !== bCreated) return aCreated < bCreated ? -1 : 1;

  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

export function evaluateExpiredInventory(snapshot: InventorySnapshotItem[]): InsightCandidate<ExpiredInventoryFacts> | null {
  // usableQuantity > 0 is implied whenever expiredBatch is non-null (it can
  // only be set from a qty > 0 batch — see inventorySnapshot.ts), but kept
  // explicit here to state both required conditions directly, per the
  // task's own eligibility wording, and as a defensive guard against a
  // future snapshot-shape change.
  const qualifying = snapshot.filter((i) => i.usableQuantity > 0 && i.expiredBatch !== null);
  if (qualifying.length === 0) return null;

  const winner = [...qualifying].sort(compareForSelection)[0];
  const expiredBatch = winner.expiredBatch as NonNullable<InventorySnapshotItem['expiredBatch']>;
  const safeName = safeItemName(winner.itemName);
  const message = safeName
    ? `${safeName} has expired. Please review this stock.`
    : 'An inventory item has expired. Please review this stock.';

  const facts: ExpiredInventoryFacts = {
    itemId: winner.itemId,
    itemName: safeName,
    quantity: winner.usableQuantity,
    expiryDate: expiredBatch.expiryDate,
    batchId: expiredBatch.batchId,
  };

  return {
    app: 'inventory',
    triggerId: 'inventory_expired',
    priority: 'CRITICAL',
    facts,
    messageTemplate: '{itemName} has expired. Please review this stock.',
    message,
    dedupeKey: `inventory_expired:${winner.itemId}:batch:${expiredBatch.batchId}:${expiredBatch.expiryDate}`,
    sourceRecordId: winner.itemId,
    evaluatedAt: new Date().toISOString(),
  };
}
