import { useEffect, useMemo, useRef, useState } from 'react';
import { Room } from '../types';
import {
  findLowStockNonLiquidItems,
  LowStockHit,
  isLowStockDismissedToday,
  dismissLowStockForToday,
} from '../services/lowStockReorder';
import { deriveAccountShopDomain, fetchSessionShopDomain, getSessionShopDomain } from '../services/mrburCart';

/**
 * Runs the low-stock reorder check once per login: when the user
 * authenticates and their inventory finishes loading, it scans every room
 * for non-liquid items at/below the reorder threshold and surfaces the
 * whole list at once, in a single LowStockReorderModal (previously this
 * queued one modal per item, shown one after another).
 *
 * The check re-arms on every fresh login — logging out and back in (or a
 * page reload that restores the session) re-scans current stock, per the
 * "trigger this check every time the user is logged in" requirement. Within
 * one login session it only runs once, so it doesn't re-fire on every
 * unrelated re-render/inventory update.
 *
 * On top of that, a shopper can tick "Don't remind me again today" on the
 * modal, which calls dismissForToday() below. That's checked here too — via
 * isLowStockDismissedToday — independent of the login-session ref, so the
 * prompt actually stays away for the rest of the calendar day even across a
 * logout/login or a page reload/PWA relaunch (previously those reset the ref
 * and brought the modal straight back).
 */
export const useLowStockReorderCheck = (
  isAuthenticated: boolean,
  isLoadingMain: boolean,
  rooms: Room[],
  userId?: string | null
) => {
  const [hits, setHits] = useState<LowStockHit[]>([]);
  const [visible, setVisible] = useState(false);
  const hasCheckedThisLogin = useRef(false);

  // Re-arm the check on logout so the next login runs it again.
  useEffect(() => {
    if (!isAuthenticated) {
      hasCheckedThisLogin.current = false;
      setHits([]);
      setVisible(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || isLoadingMain || hasCheckedThisLogin.current) return;
    hasCheckedThisLogin.current = true;
    if (isLowStockDismissedToday(userId)) return;
    const found = findLowStockNonLiquidItems(rooms);
    if (found.length) {
      setHits(found);
      setVisible(true);
    }
  }, [isAuthenticated, isLoadingMain, rooms, userId]);

  // Plain "Close": hides the modal for the rest of this login session (it
  // won't re-run until the next fresh login/reload, per hasCheckedThisLogin
  // above), but doesn't persist anything.
  const dismiss = () => setVisible(false);

  // "Don't remind me again today": persist the dismissal so the whole list
  // stays away for the rest of the calendar day, across logout/login and
  // reloads too.
  const dismissForToday = () => {
    dismissLowStockForToday(userId);
    setVisible(false);
  };

  // The shopper's mrbur.shop domain, best source first:
  //  1. /api/shop-domain — the worker asks Odoo which company/country the
  //     shared session belongs to (this app has no odoo_session of its own);
  //  2. a local odoo_session company_code, if one happens to be present;
  //  3. the most common domain among the account's already-synced shop_urls
  //     (only a guess, so not treated as authoritative).
  const [remoteDomain, setRemoteDomain] = useState<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated) {
      setRemoteDomain(null);
      return;
    }
    let cancelled = false;
    fetchSessionShopDomain().then((d) => {
      if (!cancelled && d) setRemoteDomain(d);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const sessionDomain = useMemo(
    () => (isAuthenticated ? remoteDomain ?? getSessionShopDomain() : null),
    [isAuthenticated, remoteDomain]
  );
  const shopDomain = useMemo(
    () => sessionDomain ?? deriveAccountShopDomain(rooms),
    [sessionDomain, rooms]
  );

  return {
    hits,
    visible: visible && hits.length > 0,
    dismiss,
    dismissForToday,
    shopDomain,
    shopDomainIsAuthoritative: Boolean(sessionDomain),
  };
};
