// Mandatory deterministic fallback — used ONLY when a deterministic
// provider succeeded (`status: 'ok'`) but the grounded Gemini phrasing
// request itself failed (network error, empty response, etc.). Per the
// Phase-3 pilot design, a Gemini failure at this stage must NEVER fall
// through to the existing General Chat pipeline (that would silently
// swap in the full unminimized inventory context and re-enter the
// ACTION-capable path) — this formatter renders a plain, fact-only
// sentence directly from the same structured facts, with zero LLM
// involvement.

import type { InventoryDataIntent } from '../contracts/groundedDataResult';
import type { ExpiredDataFacts } from '../providers/expiredDataProvider';
import type { LowStockDataFacts } from '../providers/lowStockDataProvider';
import type { ExpiringSoonDataFacts } from '../providers/expiringSoonDataProvider';
import type { SummaryDataFacts } from '../providers/summaryDataProvider';

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function truncationNote(count: number, shownCount: number): string {
  return count > shownCount ? ` Showing ${shownCount} of ${count}.` : '';
}

function formatExpired(facts: ExpiredDataFacts): string {
  if (facts.count === 0) return 'No expired inventory items were found.';
  const lines = facts.items.map((item) => `${item.itemName} (${item.roomName}) — expired ${item.expiryDate}`);
  return `You have ${pluralize(facts.count, 'expired inventory item')}.${truncationNote(facts.count, facts.shownCount)}\n${lines.join('\n')}`;
}

function formatLowStock(facts: LowStockDataFacts): string {
  if (facts.count === 0) return 'No low-stock inventory items were found.';
  const lines = facts.items.map((item) => `${item.itemName} (${item.roomName}) — ${item.quantity} remaining`);
  return `You have ${pluralize(facts.count, 'low-stock inventory item')} (threshold: ${facts.threshold}).${truncationNote(facts.count, facts.shownCount)}\n${lines.join('\n')}`;
}

function formatExpiringSoon(facts: ExpiringSoonDataFacts): string {
  if (facts.count === 0) {
    return `No inventory items are expiring within the next ${facts.windowDays} days.`;
  }
  const lines = facts.items.map(
    (item) => `${item.itemName} (${item.roomName}) — expires ${item.expiryDate} (${pluralize(item.daysRemaining, 'day')} remaining)`
  );
  return `You have ${pluralize(facts.count, 'item')} expiring within the next ${facts.windowDays} days.${truncationNote(facts.count, facts.shownCount)}\n${lines.join('\n')}`;
}

function formatSummary(facts: SummaryDataFacts): string {
  return (
    `Inventory summary: ${pluralize(facts.itemCount, 'item')}, ${facts.expiredCount} expired, ` +
    `${facts.outOfStockCount} out of stock, ${facts.lowStockCount} low stock, ` +
    `${facts.expiringSoonCount} expiring soon, and ${facts.healthyCount} healthy.`
  );
}

export function formatGroundedInventoryFallback(intent: InventoryDataIntent, facts: unknown): string {
  switch (intent) {
    case 'inventory_expired':
      return formatExpired(facts as ExpiredDataFacts);
    case 'inventory_low_stock':
      return formatLowStock(facts as LowStockDataFacts);
    case 'inventory_expiring_soon':
      return formatExpiringSoon(facts as ExpiringSoonDataFacts);
    case 'inventory_summary':
      return formatSummary(facts as SummaryDataFacts);
    default:
      return "I couldn't format your inventory answer right now.";
  }
}
