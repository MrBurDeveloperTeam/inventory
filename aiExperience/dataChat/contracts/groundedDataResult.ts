// Data-Driven Chat — local grounded-answer contract. Deliberately NOT
// `InsightCandidate` (../../contracts/insightCandidate.ts) — Personalized
// Insight picks ONE proactive candidate among several competing triggers;
// Data-Driven Chat answers one specific, user-selected question 1:1, with
// no "competing for a single slot" semantics. The underlying pure
// eligibility logic (buildInventorySnapshot, dateUtils, LOW_STOCK_THRESHOLD,
// EXPIRING_SOON_WINDOW_DAYS) IS shared with Personalized Insight — only the
// outer contract differs, on purpose, per the Phase-3 readiness pass.

export type InventoryDataIntent =
  | 'inventory_expired'
  | 'inventory_out_of_stock'
  | 'inventory_low_stock'
  | 'inventory_expiring_soon'
  | 'inventory_summary';

/**
 * `status: 'ok'` — the deterministic provider evaluated successfully.
 * `facts` may still describe a truthful ZERO result (e.g. `count: 0`) —
 * zero is a known fact, not an error.
 *
 * `status: 'unavailable'` — inventory state was not evaluable (still
 * loading, or the deterministic evaluation itself failed/refused, e.g. an
 * unsafe negative-quantity anomaly the existing Inventory Summary logic
 * already refuses to build a positive claim from). NEVER reinterpreted as
 * a zero/negative factual claim — see each provider's own file header.
 */
export type GroundedDataResult<TFacts> =
  | {
      status: 'ok';
      intent: InventoryDataIntent;
      facts: TFacts;
      evaluatedAt: string;
      sourceRecordIds: string[];
    }
  | {
      status: 'unavailable';
      intent: InventoryDataIntent;
      reasonCode: 'loading' | 'evaluation_error';
      evaluatedAt: string;
    };
