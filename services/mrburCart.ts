import { Item } from '../types';

/**
 * Integration point for mrbur.shop (https://www.mrbur.shop), the dental
 * supply storefront used for auto-reorder.
 *
 * mrbur.shop doesn't expose a public/documented cart API and its robots.txt
 * disallows automated scraping, so this app has no way to silently POST an
 * item into a mrbur.shop cart purely server-side without merchant/partner
 * credentials. Instead, "adding to cart" here means opening mrbur.shop in a
 * new tab so the shopper's own logged-in mrbur.shop session in that tab can
 * actually add it and check out.
 *
 * Where to send that tab depends on `item.shopUrl`:
 *  - If the item was auto-received from a mrbur.shop purchase, the Odoo-side
 *    snabbb_shop_inventory_sync module stamped its exact product page URL
 *    (Odoo's own `/shop/<slug>-<id>` shape, e.g.
 *    "https://www.mrbur.shop/shop/801-06-fg-diamond-round-9153") onto
 *    inventory_items.shop_url — use that directly.
 *  - Otherwise (manually added items, OCR/Excel imports, items bought
 *    before this existed) there's no known product page — mrbur.shop has no
 *    confirmed public search endpoint to fall back to either, so this opens
 *    mrbur.shop's homepage and lets the shopper search themselves.
 *
 * If you later get real mrbur.shop API/partner credentials, swap the body of
 * resolveMrburUrl()/addItemToMrburCart() for a real request to that endpoint
 * — the MrburCartResult shape and every call site (LowStockReorderModal)
 * can stay unchanged.
 */

export const MRBUR_BASE_URL = 'https://www.mrbur.shop';

/** Resolves the URL an item's mrbur.shop link should point to. */
export const resolveMrburUrl = (item: Item): string => {
  const stored = item.shopUrl?.trim();
  if (!stored) return MRBUR_BASE_URL;
  // shop_url is stored as an absolute URL by the Odoo sync, but tolerate a
  // bare path too in case that ever changes.
  return stored.startsWith('http') ? stored : `${MRBUR_BASE_URL}${stored}`;
};

export interface MrburCartResult {
  item: Item;
  url: string;
  /** True when `url` is the item's real mrbur.shop product page rather than
   *  the homepage fallback. */
  isDirectProductLink: boolean;
}

/**
 * Resolves where "adding this item to cart" should send the shopper.
 * Deliberately does NOT call window.open itself — opening a tab has to
 * happen inside the caller's own click handler (see LowStockReorderModal),
 * both so it isn't blocked by the browser's popup blocker and so it's never
 * accidentally triggered twice.
 */
export const addItemToMrburCart = (item: Item): MrburCartResult => {
  const url = resolveMrburUrl(item);
  return { item, url, isDirectProductLink: url !== MRBUR_BASE_URL };
};
