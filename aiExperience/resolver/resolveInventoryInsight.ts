// Minimal deterministic local resolver for this first Inventory Phase-2A
// slice — mirrors the same explicit-precedence structure already
// browser-validated in the To-Do repo's resolveTodoInsight.ts.
//
// Local priority: Expired Inventory > Out of Stock — an explicit,
// unconditional precedence check, never Promise timing, object iteration,
// or query order. Both evaluators are pure/synchronous (no network calls —
// see each provider), so there is no async race to guard against.
//
// This is intentionally NOT the Gallery global resolver
// (resolveDialogue.ts) and does not import it — Gallery's global cross-app
// priority (Expired Inventory > Overdue High Task > Appointment Within 2
// Hours > ...) is untouched and unrelated to this local, Inventory-only
// ranking. Low Stock / Expiring Soon / Inventory Summary branches are
// deliberately not present yet — see the implementation report's "Next
// Slice Notes".

import { buildInventorySnapshot } from '../utils/inventorySnapshot';
import { evaluateExpiredInventory } from '../providers/expiredInventoryProvider';
import { evaluateOutOfStock } from '../providers/outOfStockInventoryProvider';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { Room } from '../../types';

export function resolveInventoryInsight(rooms: Room[]): InsightCandidate<unknown> | null {
  const snapshot = buildInventorySnapshot(rooms);

  const expired = evaluateExpiredInventory(snapshot);
  if (expired) return expired;

  const outOfStock = evaluateOutOfStock(snapshot);
  if (outOfStock) return outOfStock;

  // Neither exists in this first slice — no Low Stock/Expiring
  // Soon/Summary fallback yet.
  return null;
}
