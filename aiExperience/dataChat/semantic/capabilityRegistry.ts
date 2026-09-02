// Capability registry — what Molar AI can actually answer in Inventory,
// independent of any specific phrasing. Consumed by
// matchInventoryCapability.ts's local semantic matcher, tried after
// classifyInventoryDataIntent's fast-path keyword table returns
// `no_match` and before falling through to General Chat.

import type { InventoryDataIntent } from '../contracts/groundedDataResult';

export interface InventoryCapability {
  id: InventoryDataIntent;
  description: string;
  keywords: string[];
}

export const INVENTORY_CAPABILITIES: InventoryCapability[] = [
  {
    id: 'inventory_expired',
    description: 'Items that have already expired.',
    keywords: ['expired', 'past expiry', 'gone bad', 'no longer usable'],
  },
  {
    id: 'inventory_out_of_stock',
    description: 'Items with zero usable quantity.',
    keywords: ['out of stock', 'running out', 'zero stock', 'no stock', 'ran out', 'need ordering', 'need to order'],
  },
  {
    id: 'inventory_low_stock',
    description: 'Items running low that should be restocked soon.',
    keywords: ['low stock', 'running low', 'short on', 'restock', 'reorder', 'need more'],
  },
  {
    id: 'inventory_expiring_soon',
    description: 'Items expiring within the near-term window.',
    keywords: ['expiring soon', 'about to expire', 'expiry coming', 'going to expire'],
  },
  {
    id: 'inventory_summary',
    description: 'Overall inventory summary across expired/low-stock/out-of-stock/expiring-soon.',
    keywords: ['inventory summary', 'stock overview', 'how is my inventory', 'inventory situation'],
  },
];
