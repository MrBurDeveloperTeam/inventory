// Minimal hook wiring the local resolver into React — mirrors the
// browser-validated To-Do pattern (useTodoPersonalizedInsight.ts).
//
// Deliberately NOT sessionStorage-deduped, NOT timer/cooldown-gated: this is
// a persistent landing-page insight, not an interruption — it should always
// reflect current stock state whenever the dashboard renders, so a
// resolved/no-longer-expired item disappears the moment `rooms` changes,
// and a newly-out-of-stock item appears the same way.
//
// Deliberately NOT polling and NOT subscribing to Supabase realtime here:
// `rooms` is already kept current by App.tsx's own existing
// receive/remove/transfer/realtime-subscription handlers (App.tsx already
// subscribes to `inventory_item_batches` changes — see App.tsx's realtime
// effect) — this hook simply re-derives the candidate whenever that
// already-current array reference changes.
//
// Gated on `isLoading`: while App.tsx's own `isLoadingMain` flag is true,
// this returns `null` rather than evaluating potentially-incomplete state
// — a candidate must never be shown based on data that hasn't finished
// hydrating (see App.tsx's "Hydrating Inventory..." overlay, the existing
// loading gate this hook reuses rather than duplicating).

import { useMemo } from 'react';
import { resolveInventoryInsight } from '../resolver/resolveInventoryInsight';
import type { InsightCandidate } from '../contracts/insightCandidate';
import type { Room } from '../../types';

export function useInventoryPersonalizedInsight(rooms: Room[], isLoading: boolean): InsightCandidate<unknown> | null {
  return useMemo(() => {
    if (isLoading) return null;

    try {
      return resolveInventoryInsight(rooms);
    } catch (err) {
      // A provider failure must never produce a fabricated personalized
      // claim or a raw error surfaced to the user. Since evaluation here is
      // pure (no network call), this is only a last-resort guard against a
      // malformed room/item/batch row; the safe behavior is simply "no
      // insight this render".
      console.warn('[aiExperience] inventory personalized insight evaluation failed:', err);
      return null;
    }
  }, [rooms, isLoading]);
}
