import { Room, Item } from '../types';
import { isLiquidCategory } from '../constants';

/** Quantity at or below which a non-liquid item is flagged for auto-reorder. */
export const LOW_STOCK_THRESHOLD = 2;

/**
 * "Don't remind me again today" persistence for the low-stock reorder
 * prompt. Backed by localStorage rather than the login-session ref in
 * useLowStockReorderCheck, so a dismissal survives a logout/login, a page
 * reload, or the PWA/tab being reopened — all of which previously reset the
 * in-memory ref and made the modal pop up again even though the shopper had
 * already seen it (and stock hadn't changed) earlier the same day.
 *
 * Scoped per userId so a shared device with more than one clinic account
 * doesn't let one account's dismissal hide the prompt for another.
 */
const LOW_STOCK_DISMISS_KEY_PREFIX = 'snabbb_lowstock_dismissed_';

const dismissKey = (userId?: string | null): string =>
  `${LOW_STOCK_DISMISS_KEY_PREFIX}${userId || 'anon'}`;

/** Local calendar day string, e.g. "2026-08-24" — uses the shopper's own
 *  timezone rather than UTC so "today" matches what they'd expect. */
const todayStamp = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const isLowStockDismissedToday = (userId?: string | null): boolean => {
  try {
    return window.localStorage.getItem(dismissKey(userId)) === todayStamp();
  } catch {
    // localStorage unavailable (private mode, etc.) — never block the check.
    return false;
  }
};

export const dismissLowStockForToday = (userId?: string | null): void => {
  try {
    window.localStorage.setItem(dismissKey(userId), todayStamp());
  } catch {
    // Best-effort only — worst case the prompt can reappear this session.
  }
};

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
