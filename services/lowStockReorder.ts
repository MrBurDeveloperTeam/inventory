import { Room, Item } from '../types';
import { isLiquidCategory } from '../constants';

/** Quantity at or below which a non-liquid item is flagged for auto-reorder. */
export const LOW_STOCK_THRESHOLD = 2;

export interface LowStockHit {
  item: Item;
  roomId: string;
  roomName: string;
}

/**
 * Scans every room's items for non-liquid stock at or below
 * LOW_STOCK_THRESHOLD. "Non-liquid" is inferred from category — see
 * LIQUID_CATEGORIES in constants.tsx. Liquid categories are skipped entirely
 * since a "quantity" of e.g. 2 bottles of rinse doesn't carry the same
 * reorder urgency as 2 units of a discrete item.
 *
 * Returns one hit per matching item, tagged with the room it lives in so the
 * UI can show the shopper where the shortage is.
 */
export const findLowStockNonLiquidItems = (rooms: Room[]): LowStockHit[] => {
  const hits: LowStockHit[] = [];
  for (const room of rooms) {
    for (const item of room.items || []) {
      if (isLiquidCategory(item.category)) continue;
      if (typeof item.quantity === 'number' && item.quantity <= LOW_STOCK_THRESHOLD) {
        hits.push({ item, roomId: room.id, roomName: room.name });
      }
    }
  }
  return hits;
};
