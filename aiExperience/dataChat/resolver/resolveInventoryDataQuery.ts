// Deterministic dispatcher: approved intent -> pure grounded provider ->
// GroundedDataResult. No Supabase query here — reuses the exact same
// `rooms`/`isLoadingMain` state App.tsx already owns (passed in by the
// caller), and the exact same `buildInventorySnapshot` Phase-2A's
// Personalized Insight already uses.
//
// READINESS: `isLoadingMain === true` short-circuits to
// `status: 'unavailable', reasonCode: 'loading'` BEFORE any provider
// runs — unknown inventory state is never reinterpreted as a zero-result
// answer.
//
// SHARED DATA-INTEGRITY GATE (hardening) — TWO checks, both run BEFORE
// dispatching to any provider, using the same snapshot/rooms every
// provider would otherwise separately consume, both blocking ALL FOUR
// intents (not just the ones that seem most obviously affected):
//
// 1. ANOMALY: a negative-`usableQuantity` snapshot entry
//    (`classifyItem(...) === 'ANOMALY'` — the exact same Phase-2A
//    classification `inventorySummaryProvider.ts` already uses, reused
//    here rather than a second validity definition). Previously only
//    Summary refused to answer over an anomaly; Expired/Low Stock/
//    Expiring Soon would silently filter the bad row out of their own
//    eligibility check and could report a false clean zero.
//
// 2. MALFORMED EXPIRY: a usable batch whose `expiryDate` is present but
//    fails `toValidatedDateKey` (see ../utils/checkMalformedExpiry.ts for
//    the full "silently ignored → false known-zero" risk and why a
//    legitimately absent expiry is NOT flagged). This affects more than
//    the obviously expiry-related intents:
//      - inventory_expired / inventory_expiring_soon: directly read
//        `expiredBatch`/`upcomingExpiryBatch`, both derived from expiry
//        validity.
//      - inventory_summary: its bucketing includes EXPIRED/EXPIRING_SOON.
//      - inventory_low_stock: TRACED — `usableQuantity` (the sum of raw
//        batch `qty`) is itself independent of expiry validity, BUT Low
//        Stock eligibility also requires `expiredBatch === null` (see
//        lowStockInventoryProvider.ts / lowStockDataProvider.ts) — and
//        `expiredBatch` selection depends on `isExpiredBeforeToday`,
//        which depends on expiry parsing. A batch whose expiry can't be
//        parsed can NEVER become `expiredBatch` (Phase-2A's own,
//        deliberately conservative "unparseable = not proven expired"
//        rule), which means an item could pass Low Stock's
//        `expiredBatch === null` check even though one of its batches'
//        true expiry status is genuinely unknown — not verified
//        not-expired. So Low Stock is gated too, evidence-based, not a
//        guess.
//
// For v1, correctness is more important than partial availability — an
// anomalous or unevaluable snapshot is never treated as equivalent to a
// valid snapshot with zero matches.
//
// A provider throwing, or (redundantly, defense-in-depth) the Summary
// provider's own internal `'anomaly'` sentinel, maps to the same
// `status: 'unavailable', reasonCode: 'evaluation_error'`. All
// `'unavailable'` cases are handled by App.tsx with a deterministic local
// "couldn't check" message — never by falling through to General Chat
// (see App.tsx's handleSendChat integration). Raw invalid field values
// are never included in the result — only the generic `reasonCode`.

import { buildInventorySnapshot } from '../../utils/inventorySnapshot';
import { toCalendarDateKey } from '../../utils/dateUtils';
import { classifyItem } from '../../providers/inventorySummaryProvider';
import { buildRoomNameLookup } from '../utils/dataChatHelpers';
import { hasMalformedExpiryData } from '../utils/checkMalformedExpiry';
import { buildExpiredDataFacts } from '../providers/expiredDataProvider';
import { buildLowStockDataFacts } from '../providers/lowStockDataProvider';
import { buildExpiringSoonDataFacts } from '../providers/expiringSoonDataProvider';
import { buildSummaryDataFacts } from '../providers/summaryDataProvider';
import type { GroundedDataResult, InventoryDataIntent } from '../contracts/groundedDataResult';
import type { Room } from '../../../types';

export function resolveInventoryDataQuery(
  intent: InventoryDataIntent,
  rooms: Room[],
  isLoadingMain: boolean,
  now: Date = new Date()
): GroundedDataResult<unknown> {
  const evaluatedAt = new Date().toISOString();

  if (isLoadingMain) {
    return { status: 'unavailable', intent, reasonCode: 'loading', evaluatedAt };
  }

  try {
    const snapshot = buildInventorySnapshot(rooms, now);

    // Shared data-integrity gate — see file header. Checked once, before
    // any provider runs, for every intent.
    const todayKey = toCalendarDateKey(now);
    const hasAnomaly = snapshot.some((item) => classifyItem(item, todayKey) === 'ANOMALY');
    if (hasAnomaly) {
      return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
    }
    if (hasMalformedExpiryData(rooms)) {
      return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
    }

    const roomNames = buildRoomNameLookup(rooms);

    switch (intent) {
      case 'inventory_expired': {
        const facts = buildExpiredDataFacts(snapshot, roomNames);
        return {
          status: 'ok',
          intent,
          facts,
          evaluatedAt,
          // `itemId` alone is a sufficient, unambiguous source identifier
          // — confirmed with LIVE database schema evidence (hardening
          // pass), not just TypeScript nesting: `public.inventory_items.id`
          // is that table's actual PRIMARY KEY (verified via a read-only
          // information_schema query against the connected Supabase
          // project), and `room_id` is a plain column on that same row —
          // moving an item between rooms (App.tsx's transfer/move flows)
          // updates `room_id` on the existing row, it never creates a
          // second row with a duplicate `id`. A primary key is by
          // definition unique across the ENTIRE table, so `item.id` is
          // genuinely globally unique across every room, not merely
          // "unique within its own nested TS array" — no composite
          // room+item+batch id is needed for traceability.
          sourceRecordIds: facts.items.map((item) => item.itemId),
        };
      }
      case 'inventory_low_stock': {
        const facts = buildLowStockDataFacts(snapshot, roomNames);
        return {
          status: 'ok',
          intent,
          facts,
          evaluatedAt,
          sourceRecordIds: facts.items.map((item) => item.itemId),
        };
      }
      case 'inventory_expiring_soon': {
        const facts = buildExpiringSoonDataFacts(snapshot, roomNames, now);
        return {
          status: 'ok',
          intent,
          facts,
          evaluatedAt,
          sourceRecordIds: facts.items.map((item) => item.itemId),
        };
      }
      case 'inventory_summary': {
        const result = buildSummaryDataFacts(snapshot, now);
        if (result === 'anomaly') {
          // Should be unreachable now that the shared gate above already
          // caught any anomaly — kept as defense-in-depth, not dead code
          // removal, in case this provider is ever called from another
          // path that skips the shared gate.
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        return { status: 'ok', intent, facts: result, evaluatedAt, sourceRecordIds: [] };
      }
      default: {
        // Exhaustiveness guard — every InventoryDataIntent member is
        // handled above; this only fires if that union is ever widened
        // without updating this switch, and is caught below like any
        // other evaluation failure.
        throw new Error(`Unhandled InventoryDataIntent: ${intent as string}`);
      }
    }
  } catch (err) {
    console.warn('[dataChat] inventory data query evaluation failed:', err);
    return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
  }
}
