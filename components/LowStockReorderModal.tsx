import React, { useState } from 'react';
import { AlertTriangle, ShoppingCart, X } from 'lucide-react';
import { LowStockHit } from '../services/lowStockReorder';
import { addItemToMrburCart, resolveMrburUrl } from '../services/mrburCart';

interface LowStockReorderModalProps {
  hit: LowStockHit;
  /** Total items still queued, including this one — used for the "N more" hint. */
  remaining: number;
  /** The shopper's known mrbur.shop country domain (e.g. "https://my.mrbur.shop"),
   *  derived from any already-synced item in their inventory — used as the
   *  fallback when this item has no shop_url of its own. Null for an account
   *  with no synced items yet, in which case the generic mrbur.shop is used. */
  shopDomain?: string | null;
  onClose: () => void;
  /** Persist "don't remind me again today" and clear the rest of the queue.
   *  Called instead of onClose when the checkbox is ticked. */
  onDismissToday: () => void;
}

/**
 * Shown once per login for each non-liquid item at/below the reorder
 * threshold (see useLowStockReorderCheck + services/lowStockReorder.ts).
 *
 * Nothing opens mrbur.shop until the shopper actually clicks "View Cart &
 * Checkout" — closing this modal (the X or "Close") just dismisses it and
 * moves on to the next queued item, with no side effect. Opening on click
 * also avoids the browser's popup blocker, which would silently swallow a
 * window.open() fired outside a direct user gesture (e.g. on mount).
 *
 * The target URL is resolved by addItemToMrburCart (services/mrburCart.ts):
 * the item's real mrbur.shop product page when it's known (items bought
 * through mrbur.shop have this stamped on them at purchase time), otherwise
 * the mrbur.shop homepage. window.open is called exactly once, here.
 *
 * "Don't remind me again today" checkbox: when ticked, both Close and View
 * Cart & Checkout route through onDismissToday instead of onClose, which
 * persists the dismissal (services/lowStockReorder.ts) and clears the whole
 * queue — not just this item — so nothing else pops up for the rest of the
 * calendar day, including across a logout/login or a reload/PWA relaunch.
 */
const LowStockReorderModal: React.FC<LowStockReorderModalProps> = ({ hit, remaining, shopDomain, onClose, onDismissToday }) => {
  const [dontShowToday, setDontShowToday] = useState(false);

  const dismiss = () => (dontShowToday ? onDismissToday() : onClose());

  const handleViewCart = () => {
    const { url } = addItemToMrburCart(hit.item, shopDomain);
    window.open(url, '_blank', 'noopener,noreferrer');
    dismiss();
  };

  const extraCount = remaining - 1;

  // Same resolution the click handler will use, just for display — so the
  // copy always names the domain the shopper is actually about to land on
  // (their own country storefront when known) instead of a hardcoded one.
  let shopHost = 'mrbur.shop';
  try {
    shopHost = new URL(resolveMrburUrl(hit.item, shopDomain)).host;
  } catch {
    // Keep the generic fallback label if the resolved URL is somehow malformed.
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-800 leading-tight">Low stock: {hit.item.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{hit.roomName}</p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors shrink-0">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Only <span className="font-bold text-slate-800">{hit.item.quantity}</span> left in stock.
            View your cart to add <span className="font-bold text-slate-800">{hit.item.name}</span> on{' '}
            <span className="font-semibold">{shopHost}</span> and check out.
          </p>
          {extraCount > 0 && (
            <p className="text-xs text-slate-400">
              {extraCount} more low-stock item{extraCount === 1 ? '' : 's'} to review after this one.
            </p>
          )}
          <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowToday}
              onChange={(e) => setDontShowToday(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#004aad] focus:ring-[#004aad]"
            />
            <span className="text-xs text-slate-500">Don't remind me about low stock again today</span>
          </label>
        </div>

        <div className="p-4 flex gap-3 bg-slate-50/50 border-t border-slate-100">
          <button
            onClick={dismiss}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleViewCart}
            className="flex-1 py-2.5 px-2.5 rounded-xl bg-[#004aad] text-white text-sm font-bold hover:bg-[#003a8a] transition-colors flex items-center justify-center gap-1.5"
          >
            <ShoppingCart size={16} />
            View Cart & Checkout
          </button>
        </div>
      </div>
    </div>
  );
};

export default LowStockReorderModal;
