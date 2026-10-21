import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShoppingCart, X, Minus, Plus } from 'lucide-react';
import { LowStockHit } from '../services/lowStockReorder';
import { addItemToMrburCart, isShopProduct, resolveMrburUrl, withShopLogin } from '../services/mrburCart';
import { fetchPublishedProducts, getCachedPublishedProducts, PublishedProduct } from '../services/publishedProducts';

interface LowStockReorderModalProps {
  /** Every non-liquid item currently at/below the reorder threshold. */
  hits: LowStockHit[];
  /** The shopper's known mrbur.shop country domain (e.g. "https://my.mrbur.shop"),
   *  derived from any already-synced item in their inventory — used as the
   *  fallback when an item has no shop_url of its own. Null for an account
   *  with no synced items yet, in which case the generic mrbur.shop is used. */
  shopDomain?: string | null;
  /** True when shopDomain comes from the shopper's session (not a guess), so it
   *  also overrides the site stored in an item's shop_url. */
  shopDomainIsAuthoritative?: boolean;
  onClose: () => void;
  /** Persist "don't remind me again today". Called instead of onClose when
   *  the checkbox is ticked. */
  onDismissToday: () => void;
}

/**
 * Shown once per login, listing every non-liquid item at/below the reorder
 * threshold. The shopper sets a reorder qty for each item directly in the
 * modal, then clicks "Restock" to open every item's mrbur.shop product page
 * in a new tab with `?add_qty=<n>` pre-filled (standard Odoo query param),
 * so all they need to do in each tab is click "Add to Cart" and proceed to
 * checkout — no manual qty entry on the shop side.
 *
 * mrbur.shop (Odoo eCommerce) has no public cart API that lets us silently
 * POST items into the shopper's cart from a cross-origin page (see
 * mrburCart.ts), so opening the product page with the qty pre-filled is the
 * closest equivalent without merchant credentials. If a real cart endpoint
 * becomes available later, swap handleRestock() — the qty state and the rest
 * of the UI stay unchanged.
 *
 * Only items that are sold in the shop (they have a shop_url from the Odoo
 * sync, or match a published catalog product) get a qty stepper and are
 * opened by Restock. Every other low-stock item (manually added, imported,
 * not in the catalog) is still listed, as a plain low-stock warning marked
 * "Not sold in shop" — no stepper, no tab, not counted in the Restock total.
 *
 * "Don't remind me again today" checkbox: when ticked, Close / Restock routes
 * through onDismissToday instead of onClose, which persists the dismissal
 * (services/lowStockReorder.ts) so nothing pops up again for the rest of the
 * calendar day, including across a logout/login or a reload/PWA relaunch.
 */
const LowStockReorderModal: React.FC<LowStockReorderModalProps> = ({
  hits,
  shopDomain,
  shopDomainIsAuthoritative = false,
  onClose,
  onDismissToday,
}) => {
  const [dontShowToday, setDontShowToday] = useState(false);

  // The published-product catalog is what lets us recognise shop products that
  // have no shop_url of their own. Start from whatever is cached and re-render
  // when the fetch lands, so an item is never shown as "Not sold in shop" just
  // because the catalog hadn't loaded yet. handleRestock reads this state
  // synchronously, so window.open stays inside the user gesture.
  const [catalog, setCatalog] = useState<PublishedProduct[] | null>(() => getCachedPublishedProducts());
  useEffect(() => {
    let cancelled = false;
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

  // Shop products first (they're the actionable ones), then the rest.
  const { shopHits, otherHits } = useMemo(() => {
    const shop: LowStockHit[] = [];
    const other: LowStockHit[] = [];
    hits.forEach((h) => (isShopProduct(h.item, catalog) ? shop : other).push(h));
    return { shopHits: shop, otherHits: other };
  }, [hits, catalog]);

  // Per-item reorder qty. Default to 1 for each item.
  const [qtys, setQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(hits.map((h) => [h.item.id, 1]))
  );

  const dismiss = () => (dontShowToday ? onDismissToday() : onClose());

  const updateQty = (id: string, next: number) =>
    setQtys((prev) => ({ ...prev, [id]: Math.max(1, Number.isFinite(next) ? next : 1) }));

  const shopHostFor = (hit: LowStockHit): string => {
    try {
      return new URL(resolveMrburUrl(hit.item, shopDomain, shopDomainIsAuthoritative)).host;
    } catch {
      return 'mrbur.shop';
    }
  };

  /**
   * Opens every item's product page in a new tab with `?add_qty=<n>` so the
   * shopper's quantity is already set when they arrive — they only need to
   * click "Add to Cart" in each tab and proceed to checkout.
   *
   * Items with no shop_url open the shop homepage / country domain as a
   * fallback (same behaviour as the old "View" button).
   */
  const handleRestock = () => {
    shopHits.forEach((hit) => {
      const qty = qtys[hit.item.id] ?? 1;
      const { url, isDirectProductLink } = addItemToMrburCart(hit.item, shopDomain, catalog, shopDomainIsAuthoritative);
      // Append add_qty only when we have a real product-page URL — appending
      // it to the homepage or a search URL would have no effect.
      const target = isDirectProductLink
        ? `${url}${url.includes('?') ? '&' : '?'}add_qty=${qty}`
        : url;
      // Go through the SSO bounce so the shop opens already signed in.
      window.open(withShopLogin(target), '_blank', 'noopener,noreferrer');
    });
    dismiss();
  };

  if (!hits.length) return null;

  const totalItems = shopHits.reduce((sum, h) => sum + (qtys[h.item.id] ?? 1), 0);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">

        {/* ── Header ── */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-800 leading-tight">
                Low stock — {hits.length} item{hits.length === 1 ? '' : 's'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {shopHits.length
                  ? 'Set a reorder qty for each shop item below'
                  : 'None of these items are sold in the shop'}
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="p-1.5 hover:bg-slate-200 rounded-full transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* ── Item list ── */}
        <div className="overflow-y-auto divide-y divide-slate-100">
          {[...shopHits, ...otherHits].map((hit) => {
            const qty = qtys[hit.item.id] ?? 1;
            const sellsInShop = isShopProduct(hit.item, catalog);
            return (
              <div key={hit.item.id} className="p-4 flex items-center gap-3">
                {/* Name + meta */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">{hit.item.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {hit.roomName} · Only{' '}
                    <span className="font-semibold text-amber-600">{hit.item.quantity}</span> left
                    {sellsInShop ? <> · {shopHostFor(hit)}</> : null}
                  </p>
                </div>

                {/* Non-shop items: warning only, nothing to add to cart */}
                {!sellsInShop && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 rounded-md px-2 py-1">
                    Not sold in shop
                  </span>
                )}

                {/* Qty stepper (shop items only) */}
                {sellsInShop && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => updateQty(hit.item.id, qty - 1)}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={12} className="text-slate-600" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => updateQty(hit.item.id, parseInt(e.target.value, 10))}
                    className="w-12 h-7 text-center text-sm font-bold text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004aad]/30 focus:border-[#004aad]"
                    aria-label={`Reorder quantity for ${hit.item.name}`}
                  />
                  <button
                    onClick={() => updateQty(hit.item.id, qty + 1)}
                    className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 active:bg-slate-200 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus size={12} className="text-slate-600" />
                  </button>
                </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Don't remind me ── */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowToday}
              onChange={(e) => setDontShowToday(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#004aad] focus:ring-[#004aad]"
            />
            <span className="text-xs text-slate-500">Don't remind me about low stock again today</span>
          </label>
        </div>

        {/* ── Actions ── */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 shrink-0 flex flex-col gap-2">
          {shopHits.length > 0 && (
            <button
              onClick={handleRestock}
              className="w-full py-2.5 rounded-xl bg-[#004aad] text-white text-sm font-bold hover:bg-[#003a8a] active:bg-[#002d6e] transition-colors flex items-center justify-center gap-2"
            >
              <ShoppingCart size={16} />
              Restock {shopHits.length} shop item{shopHits.length === 1 ? '' : 's'} · {totalItems} unit{totalItems === 1 ? '' : 's'}
            </button>
          )}
          <button
            onClick={dismiss}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LowStockReorderModal;
