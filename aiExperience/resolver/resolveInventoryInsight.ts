// Minimal deterministic local resolver for Inventory Phase-2A — now
// covering both slices. Mirrors the same explicit-precedence structure
// already browser-validated in the To-Do repo's resolveTodoInsight.ts.
//
// Local priority: Expired Inventory > Out of Stock > Low Stock > Expiring
// Soon > Inventory Summary — an explicit, unconditional precedence check,
// never Promise timing, object iteration, or query order. Every evaluator
// here is pure/synchronous (no network calls — see each provider), so
// there is no async race to guard against.
//
// Inventory Summary is NOT unconditionally constructed as a final
// fallback — evaluateInventorySummary itself may return `null` (empty
// inventory, or a negative-quantity anomaly that would make a positive
// claim untruthful — see inventorySummaryProvider.ts). If that happens,
// this resolver correctly returns `null` overall rather than fabricating a
// false "inventory looks healthy" claim.
//
// This is intentionally NOT the Gallery global resolver
// (resolveDialogue.ts) and does not import it — Gallery's global cross-app
// priority (Expired Inventory > Overdue High Task > Appointment Within 2
// Hours > ...) is untouched and unrelated to this local, Inventory-only
// ranking.

import { buildInventorySnapshot } from '../utils/inventorySnapshot';
import { evaluateExpiredInventory } from '../providers/expiredInventoryProvider';
import { evaluateOutOfStock } from '../providers/outOfStockInventoryProvider';
import { evaluateLowStock } from '../providers/lowStockInventoryProvider';
import { evaluateExpiringSoon } from '../providers/expiringSoonInventoryProvider';
import { evaluateInventorySummary } from '../providers/inventorySummaryProvider';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { Room } from '../../types';

export function resolveInventoryInsight(rooms: Room[]): InsightCandidate<unknown> | null {
  const snapshot = buildInventorySnapshot(rooms);

  const expired = evaluateExpiredInventory(snapshot);
  if (expired) return expired;

  const outOfStock = evaluateOutOfStock(snapshot);
  if (outOfStock) return outOfStock;

  const lowStock = evaluateLowStock(snapshot);
  if (lowStock) return lowStock;

  const expiringSoon = evaluateExpiringSoon(snapshot);
  if (expiringSoon) return expiringSoon;

  // May itself return null (empty inventory / anomaly guard) — a valid,
  // intentional "no candidate at all" outcome, not an error.
  return evaluateInventorySummary(snapshot);
}
