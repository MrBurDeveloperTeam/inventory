import { useEffect, useMemo, useRef, useState } from 'react';
import { Room } from '../types';
import { findLowStockNonLiquidItems, LowStockHit } from '../services/lowStockReorder';
import { deriveAccountShopDomain } from '../services/mrburCart';

/**
 * Runs the low-stock reorder check once per login: when the user
 * authenticates and their inventory finishes loading, it scans every room
 * for non-liquid items at/below the reorder threshold and queues them up
 * (one at a time) for the LowStockReorderModal to show.
 *
 * The check re-arms on every fresh login — logging out and back in (or a
 * page reload that restores the session) re-scans current stock, per the
 * "trigger this check every time the user is logged in" requirement. Within
 * one login session it only runs once, so it doesn't re-fire on every
 * unrelated re-render/inventory update.
 */
export const useLowStockReorderCheck = (
  isAuthenticated: boolean,
  isLoadingMain: boolean,
  rooms: Room[]
) => {
  const [queue, setQueue] = useState<LowStockHit[]>([]);
  const hasCheckedThisLogin = useRef(false);

  // Re-arm the check on logout so the next login runs it again.
  useEffect(() => {
    if (!isAuthenticated) {
      hasCheckedThisLogin.current = false;
      setQueue([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || isLoadingMain || hasCheckedThisLogin.current) return;
    hasCheckedThisLogin.current = true;
    const hits = findLowStockNonLiquidItems(rooms);
    if (hits.length) setQueue(hits);
  }, [isAuthenticated, isLoadingMain, rooms]);

  const dismissCurrent = () => setQueue(prev => prev.slice(1));

  // The shopper's own known mrbur.shop country domain, derived from any
  // already-synced item in their inventory — used so items with no shop_url
  // of their own (manually added, never synced, etc) still fall back to the
  // shopper's actual storefront instead of the generic international one.
  const shopDomain = useMemo(() => deriveAccountShopDomain(rooms), [rooms]);

  return {
    current: queue[0] ?? null,
    remaining: queue.length,
    dismissCurrent,
    shopDomain,
  };
};
