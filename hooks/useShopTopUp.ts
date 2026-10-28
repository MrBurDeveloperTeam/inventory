import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Item, Room } from '../types';
import {
  addItemToMrburCart,
  deriveAccountShopDomain,
  fetchSessionShopDomain,
  getSessionShopDomain,
  isShopProduct,
  withShopLogin,
} from '../services/mrburCart';
import {
  fetchPublishedProducts,
  getCachedPublishedProducts,
  PublishedProduct,
} from '../services/publishedProducts';

/**
 * Powers the per-row "top up" (purchase) button.
 *
 * Reuses the same shop plumbing as the low-stock reorder prompt
 * (LowStockReorderModal / useLowStockReorderCheck):
 *  - the shopper's own country storefront, from /api/shop-domain (their SSO
 *    session), falling back to the most common shop_url domain in their
 *    inventory, then to the generic mrbur.shop;
 *  - the published product catalog, so an item with no shop_url of its own can
 *    still be matched by SKU / exact name.
 *
 * topUp() is synchronous on purpose: it must run inside the click handler so
 * window.open isn't blocked by the popup blocker.
 */
export const useShopTopUp = (rooms: Room[]) => {
  const [remoteDomain, setRemoteDomain] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<PublishedProduct[] | null>(() => getCachedPublishedProducts());

  useEffect(() => {
    let cancelled = false;
    fetchSessionShopDomain().then((d) => {
      if (!cancelled && d) setRemoteDomain(d);
    });
    fetchPublishedProducts()
      .then((products) => {
        if (!cancelled) setCatalog(products);
      })
      .catch(() => {
        /* best effort — keep whatever was cached */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionDomain = remoteDomain ?? getSessionShopDomain();
  const shopDomain = useMemo(
    () => sessionDomain ?? deriveAccountShopDomain(rooms),
    [sessionDomain, rooms]
  );
  const domainIsAuthoritative = Boolean(sessionDomain);

  /** True when the item is a known shop product (exact page); otherwise the
   *  button falls back to searching the shop for the item's name. */
  const isExactMatch = useCallback((item: Item) => isShopProduct(item, catalog), [catalog]);

  /** Opens the item's mrbur.shop page (signed in via SSO) in a new tab with
   *  the quantity pre-filled when we have the exact product page. */
  const topUp = useCallback(
    (item: Item, qty = 1) => {
      const { url, isDirectProductLink } = addItemToMrburCart(item, shopDomain, catalog, domainIsAuthoritative);
      const target = isDirectProductLink
        ? `${url}${url.includes('?') ? '&' : '?'}add_qty=${Math.max(1, qty)}`
        : url;
      window.open(withShopLogin(target), '_blank', 'noopener,noreferrer');
    },
    [shopDomain, catalog, domainIsAuthoritative]
  );

  return { topUp, isExactMatch };
};
