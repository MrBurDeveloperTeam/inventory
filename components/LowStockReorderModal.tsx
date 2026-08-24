import React, { useState } from 'react';
import { AlertTriangle, ShoppingCart, X } from 'lucide-react';
import { LowStockHit } from '../services/lowStockReorder';
import { addItemToMrburCart, resolveMrburUrl } from '../services/mrburCart';

interface LowStockReorderModalProps {
  /** Every non-liquid item currently at/below the reorder threshold. */
  hits: LowStockHit[];
  /** The shopper's known mrbur.shop country domain (e.g. "https://my.mrbur.shop"),
   *  derived from any already-synced item in their inventory — used as the
   *  fallback when an item has no shop_url of its own. Null for an account
   *  with no synced items yet, in which case the generic mrbur.shop is used. */
  shopDomain?: string | null;
  onClose: () => void;
  /** Persist "don't remind me again today". Called instead of onClose when
   *  the checkbox is ticked. */
  onDismissToday: () => void;
}

/**
 * Shown once per login, listing every non-liquid item at/below the reorder
 * threshold in one scrollable list (see useLowStockReorderCheck +
 * services/lowStockReorder.ts) — previously this was one modal per item,
 * shown one after another.
 *
 * Nothing opens mrbur.shop until the shopper actually clicks a row's "View"
 * button — closing this modal (the X or "Close") just dismisses the whole
 * list, with no side effect. Opening on click also avoids the browser's
 * popup blocker, which would silently swallow a window.open() fired outside
 * a direct user gesture (e.g. on mount).
 *
 * Each row's target URL is resolved independently by addItemToMrburCart
 * (services/mrburCart.ts): the item's real mrbur.shop product page when
 * it's known (items bought through mrbur.shop have this stamped on them at
 * purchase time), otherwise the mrbur.shop homepage. There's no bulk mrbur.shop
 * cart API to add every item at once (see mrburCart.ts), so each row opens
 * its own product page in a new tab when clicked — the shopper can click as
 * many rows as they want without the modal closing in between.
 *
 * "Don't remind me again today" checkbox: when ticked, Close routes through
 * onDismissToday instead of onClose, which persists the dismissal
 * (services/lowStockReorder.ts) so nothing pops up again for the rest of the
 * calendar day, including across a logout/login or a reload/PWA relaunch.
 */
const LowStockReorderModal: React.FC<LowStockReorderModalProps> = ({ hits, shopDomain, onClose, onDismissToday }) => {
  const [dontShowToday, setDontShowToday] = useState(false);

  const dismiss = () => (dontShowToday ? onDismissToday() : onClose());

  const handleViewItem = (hit: LowStockHit) => {
    const { url } = addItemToMrburCart(hit.item, shopDomain);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shopHostFor = (hit: LowStockHit): string => {
    try {
      return new URL(resolveMrburUrl(hit.item, shopDomain)).host;
    } catch {
      // Keep a generic fallback label if the resolved URL is somehow malformed.
      return 'mrbur.shop';
    }
  };

  if (!hits.length) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-800 leading-tight">
                Low stock — {hits.length} item{hits.length === 1 ? '' : 's'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Reorder before you run out</p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors shrink-0">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100">
          {hits.map((hit) => (
            <div key={hit.item.id} className="p-4 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate">{hit.item.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {hit.roomName} · Only <span className="font-semibold text-amber-600">{hit.item.quantity}</span> left ·{' '}
                  {shopHostFor(hit)}
                </p>
              </div>
              <button
                onClick={() => handleViewItem(hit)}
                className="shrink-0 py-2 px-3 rounded-lg bg-[#004aad] text-white text-xs font-bold hover:bg-[#003a8a] transition-colors flex items-center gap-1.5"
              >
                <ShoppingCart size={14} />
                View
              </button>
            </div>
          ))}
        </div>

        <div className="p-5 pt-4 border-t border-slate-100 shrink-0">
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

        <div className="p-4 bg-slate-50/50 border-t border-slate-100 shrink-0">
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
