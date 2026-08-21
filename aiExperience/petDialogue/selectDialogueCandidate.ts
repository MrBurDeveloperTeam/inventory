import { isDialogueDismissed } from './sessionDedupe';
import type { InsightCandidate } from '../contracts/insightCandidate';

/**
 * Dialogue-layer-only pool scan — mirrors the identical, already-hardened
 * App Gallery pattern (App Gallery's
 * features/petDialogue/selectDialogueCandidate.ts). Given a family's
 * ORDERED candidate pool (business ordering already applied by the
 * provider — see e.g. expiredInventoryProvider.ts's
 * evaluateExpiredInventoryCandidates), returns the first candidate that is
 * neither already shown THIS MOUNT nor explicitly dismissed for `userId`,
 * or `null` if every candidate in the pool is currently ineligible.
 *
 * `shownCandidateKeys` is the caller's own in-memory, mount-scoped
 * `Set<string>` (CatMascot.jsx's `shownCandidateKeysRef.current`) — never
 * persisted storage. This is what replaced the old sessionStorage-backed
 * "seen this session" mark: sessionStorage survives a same-tab reload, so
 * a candidate merely shown (never explicitly Closed) was being
 * incorrectly suppressed on every subsequent reload. A plain in-memory Set
 * naturally resets on every fresh mount (which a reload always is), so a
 * shown-only candidate correctly remains eligible again after F5, while
 * `isDialogueDismissed` (localStorage) continues to correctly suppress a
 * candidate the user actually Closed, across reloads and tabs.
 *
 * Deliberately lives here, not in any aiExperience/providers/*.ts or
 * aiExperience/resolver/*.ts file: those must stay
 * pure/deterministic/storage-independent, so all localStorage-aware
 * suppression is confined to this dialogue-only helper plus
 * sessionDedupe.ts — providers never see `shownCandidateKeys` either.
 */
export function selectFirstEligibleDialogueCandidate(
  userId: string,
  orderedCandidates: InsightCandidate<unknown>[],
  shownCandidateKeys: Set<string>
): InsightCandidate<unknown> | null {
  for (const candidate of orderedCandidates) {
    if (shownCandidateKeys.has(candidate.dedupeKey)) continue;
    if (!isDialogueDismissed(userId, candidate.dedupeKey)) return candidate;
  }
  return null;
}
