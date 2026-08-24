import { Item } from '../types';

/**
 * Integration point for mrbur.shop (https://www.mrbur.shop), the dental
 * supply storefront used for auto-reorder.
 *
 * mrbur.shop doesn't expose a public/documented cart API and its robots.txt
 * disallows automated scraping, so this app has no way to silently POST an
 * item into a mrbur.shop cart purely server-side without merchant/partner
 * credentials. Instead, "adding to cart" here means opening mrbur.shop in a
 * new tab, pre-searched for the item, so the shopper's own logged-in
 * mrbur.shop session in that tab can actually add it and check out.
 *
 * If you later get real mrbur.shop API/partner credentials, swap the body of
 * addItemToMrburCart() for a real request to that endpoint — the
 * MrburCartResult shape and every call site (useLowStockReorderCheck,
 * LowStockReorderModal) can stay unchanged.
 */

export const MRBUR_BASE_URL = 'https://www.mrbur.shop';

/**
 * Best-effort search URL for an item on mrbur.shop. NOTE: the exact search
 * query-string parameter below (`keyword`) has not been confirmed against
 * mrbur.shop directly — their robots.txt blocks automated verification. If
 * this doesn't land on the right results page, run one manual search on
 * mrbur.shop and update MRBUR_SEARCH_PATH/param below to match.
 */
const MRBUR_SEARCH_PATH = '/shop/search.html';

export const buildMrburSearchUrl = (query: string): string =>
  `${MRBUR_BASE_URL}${MRBUR_SEARCH_PATH}?keyword=${encodeURIComponent(query)}`;

export interface MrburCartResult {
  item: Item;
  searchUrl: string;
  /** False when the browser's popup blocker prevented window.open (common
   *  when this runs outside a direct click, e.g. right after auto-login). */
  opened: boolean;
}

/**
 * Attempts to open mrbur.shop, pre-searched for the given item, in a new
 * tab — standing in for "adding it to cart" until real API credentials are
 * wired up. Prefers the item's SKU/code (more precise) and falls back to its
 * name.
 */
export const addItemToMrburCart = (item: Item): MrburCartResult => {
  const query = item.code?.trim() || item.name;
  const searchUrl = buildMrburSearchUrl(query);
  const win = window.open(searchUrl, '_blank', 'noopener,noreferrer');
  return { item, searchUrl, opened: !!win };
};
