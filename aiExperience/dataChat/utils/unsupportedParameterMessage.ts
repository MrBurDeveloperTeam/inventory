// Deterministic local response for a data question that matched an
// approved intent's keywords but also carried an explicit user-supplied
// threshold/window override (see
// ../router/classifyInventoryDataIntent.ts's `hasExplicitParameterOverride`).
// Zero Gemini calls. Never silently answers using the fixed rule as if it
// matched what was actually asked, and never falls through to General
// Chat — the numbers below are read from the SAME constants the real
// providers use (imported, never re-typed), so this message can never
// drift out of sync with the actual enforced threshold/window.

import { LOW_STOCK_THRESHOLD } from '../../providers/lowStockInventoryProvider';
import { EXPIRING_SOON_WINDOW_DAYS } from '../../providers/expiringSoonInventoryProvider';
import type { InventoryDataIntent } from '../contracts/groundedDataResult';

export function buildUnsupportedParameterMessage(intent: InventoryDataIntent): string {
  if (intent === 'inventory_low_stock') {
    return `Custom stock thresholds aren't supported in data chat yet. I can check low stock using the current threshold of ${LOW_STOCK_THRESHOLD}.`;
  }
  if (intent === 'inventory_expiring_soon') {
    return `Custom expiry windows aren't supported in data chat yet. I can check items expiring within the current ${EXPIRING_SOON_WINDOW_DAYS}-day window.`;
  }
  return "That custom option isn't supported in data chat yet.";
}
