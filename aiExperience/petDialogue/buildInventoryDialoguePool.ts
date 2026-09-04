// Dialogue-layer-only pool construction for Inventory's Cat Reminder — sits
// alongside selectDialogueCandidate.ts. Deliberately separate from
// aiExperience/resolver/resolveInventoryInsight.ts (the inline
// PersonalizedInsight banner's resolver), which stays completely untouched
// and keeps returning exactly one pure business winner.
//
// Confirmed starvation defect this fixes: resolveInventoryInsight.ts
// reduces each family (Expired / Out of Stock / Low Stock / Expiring Soon)
// to ONE winner before Cat's dismissal check ever runs. If that winner gets
// Cat-dismissed but is still business-eligible, the next Cat activation
// resolves the exact same winner again, Cat suppresses it again, and a
// second still-eligible record in the SAME family is never reached — Cat
// incorrectly falls through to Welcome Back even though e.g. a second
// expired item exists.
//
// Fix: build one ORDERED pool per family (reusing each provider's own
// existing eligibility/sort/candidate-construction verbatim — see each
// provider's new `evaluate*Candidates` export), concatenate the four
// families in the exact same priority order resolveInventoryInsight.ts
// already uses, then append Inventory Summary last as the final singleton
// fallback. selectFirstEligibleDialogueCandidate (selectDialogueCandidate.ts)
// then does one linear scan for the first not-seen/not-dismissed entry —
// which is equivalent to "first eligible candidate within a family, else
// move to the next family" purely because the families are concatenated in
// priority order and the scan is a single left-to-right pass.
//
// Building this pool is pure/synchronous (same already-loaded `rooms` state
// the inline banner uses, via buildInventorySnapshot) — no new Supabase
// query, no browser storage read. Only selectFirstEligibleDialogueCandidate
// (called separately, by the caller, once a userId is known) touches
// sessionStorage/localStorage — this file never does.

import { buildInventorySnapshot } from '../utils/inventorySnapshot';
import { evaluateExpiredInventoryCandidates } from '../providers/expiredInventoryProvider';
import { evaluateOutOfStockCandidates } from '../providers/outOfStockInventoryProvider';
import { evaluateLowStockCandidates } from '../providers/lowStockInventoryProvider';
import { evaluateExpiringSoonCandidates } from '../providers/expiringSoonInventoryProvider';
import { evaluateInventorySummary } from '../providers/inventorySummaryProvider';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { Room } from '../../types';

/**
 * Ordered pool of every candidate Cat may legitimately choose from, in
 * exact resolveInventoryInsight.ts family priority order: Expired > Out of
 * Stock > Low Stock > Expiring Soon > Inventory Summary. `pool[0]` (when no
 * suppression is applied) is always identical to
 * `resolveInventoryInsight(rooms)` — same eligibility, same tie-breaks,
 * same candidate construction, just not yet collapsed to one winner.
 *
 * Inventory Summary is appended unconditionally (not gated on the other
 * four pools being empty, unlike resolveInventoryInsight.ts's own
 * short-circuit) so it remains reachable as Cat's final fallback even when
 * record-specific items exist but every one of them is already
 * Cat-suppressed — see the task's Scenario E. `evaluateInventorySummary`
 * itself still decides its own eligibility (empty inventory / anomaly
 * guard), so this never fabricates a summary that provider wouldn't
 * otherwise produce.
 */
export function buildInventoryDialoguePool(rooms: Room[]): InsightCandidate<unknown>[] {
  const snapshot = buildInventorySnapshot(rooms);

  const pool: InsightCandidate<unknown>[] = [
    ...evaluateExpiredInventoryCandidates(snapshot),
    ...evaluateOutOfStockCandidates(snapshot),
    ...evaluateLowStockCandidates(snapshot),
    ...evaluateExpiringSoonCandidates(snapshot),
  ];

  const summary = evaluateInventorySummary(snapshot);
  if (summary) pool.push(summary);

  return pool;
}
