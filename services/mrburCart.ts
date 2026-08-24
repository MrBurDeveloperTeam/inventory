import { Item, Room } from '../types';

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
 * mr.bur runs one storefront per country as a separate Odoo website behind
 * Cloudflare (my.mrbur.shop, sg.mrbur.shop, th.mrbur.shop, ...), so which
 * domain a shopper should land on depends on where their account actually
 * shops, not a single hardcoded URL. Where the tab goes is resolved in two
 * steps:
 *  - If the item itself was auto-received from a mrbur.shop purchase, the
 *    Odoo-side snabbb_shop_inventory_sync module stamped its exact product
 *    page URL (Odoo's own `/shop/<slug>-<id>` shape, already on the correct
 *    country domain, e.g. "https://my.mrbur.shop/shop/801-06-fg-diamond-round-9153")
 *    onto inventory_items.shop_url — use that directly.
 *  - Otherwise (manually added items, OCR/Excel imports, items bought before
 *    this existed, or this item just never happened to sync) there's no
 *    per-item link, but the shopper's OTHER items very likely do carry one —
 *    deriveAccountShopDomain() scans the whole account's inventory for any
 *    already-known shop_url and reuses that domain, so the fallback still
 *    lands on the shopper's own country storefront instead of the generic
 *    international mrbur.shop homepage. Only an account with zero synced
 *    items ever falls all the way back to MRBUR_BASE_URL.
 *
 * If you later get real mrbur.shop API/partner credentials, swap the body of
 * resolveMrburUrl()/addItemToMrburCart() for a real request to that endpoint
 * — the MrburCartResult shape and every call site (LowStockReorderModal)
 * can stay unchanged.
 */

export const MRBUR_BASE_URL = 'https://www.mrbur.shop';

/**
 * Scans every item in the account for an already-known mrbur.shop link and
 * returns its origin (e.g. "https://my.mrbur.shop"), so items with no link
 * of their own can still fall back to the shopper's actual country
 * storefront instead of the generic international domain. Returns null if
 * no item in the account has a known shop_url yet (e.g. a brand-new account
 * that's never had a mrbur.shop order sync in).
 *
 * Picks the most common domain across the account rather than just the
 * first match, so one stray/incorrect shop_url can't skew the fallback.
 */
export const deriveAccountShopDomain = (rooms: Room[]): string | null => {
  const counts = new Map<string, number>();
  for (const room of rooms) {
    for (const item of room.items || []) {
      const stored = item.shopUrl?.trim();
      if (!stored || !stored.startsWith('http')) continue;
      try {
        const origin = new URL(stored).origin;
        counts.set(origin, (counts.get(origin) || 0) + 1);
      } catch {
        // Malformed shop_url on some item — ignore it and keep scanning.
      }
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [origin, count] of counts) {
    if (count > bestCount) {
      best = origin;
      bestCount = count;
    }
  }
  return best;
};

/**
 * Resolves the URL an item's mrbur.shop link should point to.
 * `fallbackDomain` (from deriveAccountShopDomain) is used ahead of the
 * generic MRBUR_BASE_URL whenever the item itself has no shop_url.
 */
export const resolveMrburUrl = (item: Item, fallbackDomain?: string | null): string => {
  const base = fallbackDomain || MRBUR_BASE_URL;
  const stored = item.shopUrl?.trim();
  if (!stored) return base;
  // shop_url is stored as an absolute URL by the Odoo sync, but tolerate a
  // bare path too in case that ever changes.
  return stored.startsWith('http') ? stored : `${base}${stored}`;
};

export interface MrburCartResult {
  item: Item;
  url: string;
  /** True when `url` is the item's real mrbur.shop product page rather than
   *  a homepage fallback (generic or country-derived). */
  isDirectProductLink: boolean;
}

/**
 * Resolves where "adding this item to cart" should send the shopper.
 * Deliberately does NOT call window.open itself — opening a tab has to
 * happen inside the caller's own click handler (see LowStockReorderModal),
 * both so it isn't blocked by the browser's popup blocker and so it's never
 * accidentally triggered twice.
 */
export const addItemToMrburCart = (item: Item, fallbackDomain?: string | null): MrburCartResult => {
  const url = resolveMrburUrl(item, fallbackDomain);
  return { item, url, isDirectProductLink: Boolean(item.shopUrl?.trim()) };
};
