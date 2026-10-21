import { Item, Room } from '../types';
import { getActiveCompanyFromOdooSession } from './getCompanies';
import type { PublishedProduct } from './publishedProducts';

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
 * shops, not a single hardcoded URL. Where the tab goes is resolved in
 * priority order:
 *  1. If the item itself was auto-received from a mrbur.shop purchase, the
 *     Odoo-side snabbb_shop_inventory_sync module stamped its exact product
 *     page URL (Odoo's own `/shop/<slug>-<id>` shape, already on the correct
 *     country domain, e.g. "https://my.mrbur.shop/shop/801-06-fg-diamond-round-9153")
 *     onto inventory_items.shop_url — use that directly, always.
 *  2. Otherwise (manually added items, OCR/Excel imports, items bought
 *     before this existed, or this item just never happened to sync) there's
 *     no per-item link, so the caller needs a fallback *domain* — resolved
 *     with this priority:
 *       a. getSessionShopDomain() — the authoritative answer, read straight
 *          out of this app's own `odoo_session` (localStorage, set at login
 *          by the same SSO flow app.snabbb.com uses) via the existing
 *          getActiveCompanyFromOdooSession() helper. Its `company_code`
 *          (e.g. "MMY" for Malaysia, "INT" for the generic international
 *          site) maps straight to a domain — synchronous, no network call,
 *          and works even for a brand-new account with zero synced items.
 *       b. deriveAccountShopDomain() — a fallback for the rare case the
 *          session has no usable company_code yet: scans the account's own
 *          inventory for any already-known shop_url and reuses that domain.
 *       c. MRBUR_BASE_URL — last resort when neither signal is available.
 *
 * If you later get real mrbur.shop API/partner credentials, swap the body of
 * resolveMrburUrl()/addItemToMrburCart() for a real request to that endpoint
 * — the MrburCartResult shape and every call site (LowStockReorderModal)
 * can stay unchanged.
 */

export const MRBUR_BASE_URL = 'https://www.mrbur.shop';
/** The bare, no-subdomain site used for company_code "INT" (no specific country). */
export const MRBUR_INTERNATIONAL_URL = 'https://mrbur.shop';

/**
 * Maps a Snabbb `company_code` (e.g. "MMY", "MSG", "MTH", or "INT" for the
 * generic international company) to the matching mrbur.shop domain. Every
 * country code is "M" + the 2-letter ISO country code; "INT" is the one
 * exception and maps to the bare international site.
 */
export const resolveDomainFromCompanyCode = (companyCode?: string | null): string | null => {
  const code = companyCode?.trim().toUpperCase();
  if (!code) return null;
  if (code === 'INT') return MRBUR_INTERNATIONAL_URL;
  if (code[0] !== 'M') return null;
  const countryCode = code.slice(1).toLowerCase();
  if (!/^[a-z]{2}$/.test(countryCode)) return null;
  return `https://${countryCode}.mrbur.shop`;
};

/**
 * Reads which company/country this session belongs to straight out of the
 * app's own `odoo_session` (localStorage, populated at login by the same
 * SSO flow app.snabbb.com uses — see getCompanies.ts, already relied on
 * elsewhere in this app e.g. useCreateAppLink) and resolves that to a
 * mrbur.shop domain. This is the authoritative source: it reflects the
 * account's real assignment rather than a guess from whatever happens to be
 * in this app's own inventory data, and it works even for a brand-new
 * account with zero synced items. Purely synchronous — no network call.
 *
 * Returns null if there's no session yet, the session has no usable
 * company_code, or the code doesn't match the expected shape — callers fall
 * back to deriveAccountShopDomain()/MRBUR_BASE_URL in that case.
 */
export const getSessionShopDomain = (): string | null => {
  const active = getActiveCompanyFromOdooSession();
  if (!active) return null;
  return resolveDomainFromCompanyCode(active.companyCode);
};

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
export const resolveMrburUrl = (
  item: Item,
  fallbackDomain?: string | null,
  domainIsAuthoritative = false
): string => {
  const base = fallbackDomain || MRBUR_BASE_URL;
  const stored = item.shopUrl?.trim();
  if (!stored) return base;
  // shop_url is stored as an absolute URL by the Odoo sync, but tolerate a
  // bare path too in case that ever changes.
  if (!stored.startsWith('http')) return `${base}${stored}`;
  // When the shopper's own country shop is known for certain (their session),
  // keep the product path but send them to THEIR storefront rather than
  // whichever site the item happened to be bought on (e.g. the generic
  // international site), so they land on the right website and session.
  if (domainIsAuthoritative && fallbackDomain) {
    try {
      const u = new URL(stored);
      return `${fallbackDomain}${u.pathname}${u.search}${u.hash}`;
    } catch {
      /* malformed — use it as stored */
    }
  }
  return stored;
};

let sessionDomainPromise: Promise<string | null> | null = null;

/**
 * Asks the worker (GET /api/shop-domain) which country shop this account's
 * Odoo session belongs to. Needed because this app has no `odoo_session` in
 * its own localStorage, so getSessionShopDomain() is empty here. Result is
 * shared between callers; a failed/empty lookup is retried next time.
 */
export const fetchSessionShopDomain = (): Promise<string | null> => {
  if (!sessionDomainPromise) {
    sessionDomainPromise = fetch('/api/shop-domain', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (typeof d?.domain === 'string' && d.domain ? (d.domain as string) : null))
      .catch(() => null)
      .then((domain) => {
        if (!domain) sessionDomainPromise = null;
        return domain;
      });
  }
  return sessionDomainPromise;
};

const norm = (s?: string | null): string => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Finds the shop product for an inventory item that has no shop_url of its
 * own, by matching the published catalog: SKU == item code first, then an
 * exact (case/space-insensitive) name match. A name that matches more than
 * one catalog product is treated as ambiguous and returns null rather than
 * sending the shopper to a guess.
 */
export const findCatalogProduct = (
  item: Item,
  catalog?: PublishedProduct[] | null
): PublishedProduct | null => {
  if (!catalog?.length) return null;
  const code = norm(item.code);
  if (code) {
    const bySku = catalog.find((p) => norm(p.sku) === code);
    if (bySku) return bySku;
  }
  const name = norm(item.name);
  if (!name) return null;
  const byName = catalog.filter((p) => norm(p.name) === name);
  return byName.length === 1 ? byName[0] : null;
};

/**
 * True when the item is a product sold in the mrbur.shop: it either carries
 * the exact product link stamped by the Odoo sync (shopUrl) or matches a
 * published catalog product by SKU / exact name. Only these items can be
 * added to the shop cart; everything else (manual / imported items that
 * aren't in the catalog) is shown as a plain low-stock warning.
 */
export const isShopProduct = (
  item: Item,
  catalog?: PublishedProduct[] | null
): boolean => Boolean(item.shopUrl?.trim()) || findCatalogProduct(item, catalog) !== null;

export type MrburLinkType = 'product' | 'search' | 'home';

export interface MrburCartResult {
  item: Item;
  url: string;
  /** What `url` points at: the item's own product page ('product'), the
   *  shop's search results for the item name ('search'), or just the shop
   *  homepage ('home'). */
  linkType: MrburLinkType;
  /** True when `url` is a real mrbur.shop product page (not search/home). */
  isDirectProductLink: boolean;
}

/**
 * Resolves where "restocking this item" should send the shopper, best first:
 *  1. item.shopUrl — exact product page stamped by the Odoo sync.
 *  2. the published-catalog match (SKU, then exact name) -> `<domain>/shop/<id>`
 *     (Odoo redirects /shop/<id> to the canonical /shop/<slug>-<id> page).
 *  3. the shop's own search for the item name on the shopper's country domain.
 *  4. the shop homepage (only when the item has no name).
 *
 * Deliberately does NOT call window.open itself — opening a tab has to
 * happen inside the caller's own click handler (see LowStockReorderModal),
 * both so it isn't blocked by the browser's popup blocker and so it's never
 * accidentally triggered twice.
 */
export const addItemToMrburCart = (
  item: Item,
  fallbackDomain?: string | null,
  catalog?: PublishedProduct[] | null,
  domainIsAuthoritative = false
): MrburCartResult => {
  const base = fallbackDomain || MRBUR_BASE_URL;

  if (item.shopUrl?.trim()) {
    return { item, url: resolveMrburUrl(item, fallbackDomain, domainIsAuthoritative), linkType: 'product', isDirectProductLink: true };
  }

  const match = findCatalogProduct(item, catalog);
  if (match) {
    return { item, url: `${base}/shop/${match.id}`, linkType: 'product', isDirectProductLink: true };
  }

  const name = item.name?.trim();
  if (name) {
    return {
      item,
      url: `${base}/shop?search=${encodeURIComponent(name)}`,
      linkType: 'search',
      isDirectProductLink: false,
    };
  }

  return { item, url: base, linkType: 'home', isDirectProductLink: false };
};

/** The same launcher the App.Snabbb "Mr.Bur" tile uses: signs the shopper into
 *  their country shop through Odoo's SSO, then 302s to the shop. */
export const SSO_SHOP_LAUNCH_URL = 'https://app.snabbb.com/api/v1/sso/app_link';

/**
 * Wraps a mrbur.shop URL so the shopper arrives already signed in.
 *
 * Opening the shop directly lands a guest there (the shop has its own
 * session, separate from Snabbb's), hence "Sign in to see price". Instead the
 * new tab goes through the worker's GET /api/v1/sso/app_link?app_code=shop —
 * the exact route the gallery's Mr.Bur tile uses — which asks Odoo for an SSO
 * token and redirects via /api/sso/odoo-exchange to the shopper's country shop
 * (`<country>.mrbur.shop/sso/token`). `next` carries the product page's path
 * and query so they land there rather than the shop home. The shop host is
 * chosen by the worker from the user's own country, so only path + query are
 * sent (the #fragment is dropped).
 *
 * Only mrbur.shop URLs are wrapped; anything else opens as is.
 */
export const withShopLogin = (targetUrl: string): string => {
  try {
    const u = new URL(targetUrl);
    if (u.hostname === 'mrbur.shop' || u.hostname.endsWith('.mrbur.shop')) {
      const next = `${u.pathname}${u.search}`;
      return `${SSO_SHOP_LAUNCH_URL}?app_code=shop&next=${encodeURIComponent(next)}`;
    }
  } catch {
    /* not a valid URL — open it as is */
  }
  return targetUrl;
};
