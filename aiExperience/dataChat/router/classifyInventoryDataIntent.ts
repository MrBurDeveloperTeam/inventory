// Deterministic LOCAL intent router — no Gemini call for classification.
// A small closed keyword/pattern table for exactly the four approved v1
// intents. If nothing matches, the caller falls through unchanged to the
// existing predefined-response/General Chat pipeline (see App.tsx's
// handleSendChat) — this router never attempts broad natural-language
// understanding, and never lets the model choose which provider/data
// scope to access.

import type { InventoryDataIntent } from '../contracts/groundedDataResult';

/** Fixed priority order — also the tie-break for equal-length keyword
 *  matches across different intents (see `classifyInventoryDataIntent`
 *  below). Mirrors the existing DB-backed `getPredefinedChatResponse`'s
 *  own "longest keyword wins" convention (App.tsx), extended with an
 *  explicit fixed-order tie-break rather than leaving ties to object/array
 *  iteration order. */
const INTENT_PRIORITY: InventoryDataIntent[] = [
  'inventory_expired',
  'inventory_low_stock',
  'inventory_expiring_soon',
  'inventory_summary',
];

const INTENT_KEYWORDS: Record<InventoryDataIntent, string[]> = {
  inventory_expired: [
    'any expired inventory',
    'what is expired',
    'expired inventory',
    'expired items',
    'expired stock',
    'expired',
  ],
  inventory_low_stock: [
    'what is low in stock',
    'which items are low',
    'low on stock',
    'running low',
    'low inventory',
    'low stock',
  ],
  inventory_expiring_soon: [
    'what expires soon',
    'anything expiring',
    'expiring this month',
    'expiring soon',
    'expires soon',
    'expiry soon',
  ],
  inventory_summary: [
    'give me an inventory summary',
    'summarize my inventory',
    'inventory overview',
    'inventory summary',
    'how much inventory',
    'stock summary',
  ],
};

/**
 * HARDENING: an intent whose keyword matched but whose message ALSO
 * carries an explicit user-supplied parameter that would change the
 * FILTERING CRITERION (Low Stock's threshold, Expiring Soon's window) is
 * no longer treated as a plain non-match (`'no_match'`) — a plain
 * non-match used to fall straight through to the existing, unminimized
 * General Chat, which would let the user bypass grounding entirely just
 * by adding a number. It is now classified `'unsupported_parameter'`
 * instead — see `classifyInventoryDataQuery`'s return type below — so
 * the caller can respond deterministically without EVER reaching General
 * Chat or running the provider under a threshold/window the user didn't
 * actually ask for.
 *
 * Result-count overrides (e.g. "show 20 expired items") are deliberately
 * NOT covered by this check — Expired has no fixed numeric eligibility
 * criterion to silently violate; the correct, fully-current set of
 * expired items is still returned, just capped to the same top-5 display
 * limit as any other Expired query, and the grounded response is already
 * required to truthfully disclose "showing 5 of N" — so a display-count
 * request doesn't create the same "answered under the wrong criterion"
 * risk a threshold/window override would. This is a deliberate, singular
 * choice (see this feature's implementation report), not an oversight.
 */
function hasExplicitParameterOverride(normalized: string, intent: InventoryDataIntent): boolean {
  if (intent === 'inventory_expiring_soon') {
    return /\b(?:within|in|next)\s+\d+\s+days?\b/.test(normalized);
  }
  if (intent === 'inventory_low_stock') {
    return /\b(?:below|under|less than|fewer than)\s+\d+\b/.test(normalized);
  }
  return false;
}

export type InventoryDataRouteResult =
  | { kind: 'matched'; intent: InventoryDataIntent }
  | { kind: 'unsupported_parameter'; intent: InventoryDataIntent }
  | { kind: 'no_match' };

export function classifyInventoryDataIntent(message: string): InventoryDataRouteResult {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return { kind: 'no_match' };

  let bestIntent: InventoryDataIntent | null = null;
  let bestKeywordLength = -1;
  let bestPriorityIndex = Number.POSITIVE_INFINITY;

  for (const intent of INTENT_PRIORITY) {
    const priorityIndex = INTENT_PRIORITY.indexOf(intent);
    for (const keyword of INTENT_KEYWORDS[intent]) {
      if (!normalized.includes(keyword)) continue;

      const isBetterMatch =
        keyword.length > bestKeywordLength ||
        (keyword.length === bestKeywordLength && priorityIndex < bestPriorityIndex);

      if (isBetterMatch) {
        bestIntent = intent;
        bestKeywordLength = keyword.length;
        bestPriorityIndex = priorityIndex;
      }
    }
  }

  if (!bestIntent) return { kind: 'no_match' };
  if (hasExplicitParameterOverride(normalized, bestIntent)) {
    return { kind: 'unsupported_parameter', intent: bestIntent };
  }

  return { kind: 'matched', intent: bestIntent };
}
