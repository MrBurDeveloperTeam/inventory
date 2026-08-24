import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShoppingCart, X } from 'lucide-react';
import { LowStockHit } from '../services/lowStockReorder';
import { addItemToMrburCart, MrburCartResult } from '../services/mrburCart';

interface LowStockReorderModalProps {
  hit: LowStockHit;
  /** Total items still queued, including this one — used for the "N more" hint. */
  remaining: number;
  onClose: () => void;
}

/**
 * Shown once per login for each non-liquid item at/below the reorder
 * threshold (see useLowStockReorderCheck + services/lowStockReorder.ts).
 *
 * On mount it fires a best-effort attempt to open mrbur.shop pre-searched
 * for the item (services/mrburCart.ts) — this can be silently blocked by the
 * browser's popup blocker since it isn't the direct result of a click. The
 * "View Cart & Checkout" button re-issues that same window.open() from an
 * actual click, which is never blocked, so the shopper always has a working
 * path to mrbur.shop either way.
 */
const LowStockReorderModal: React.FC<LowStockReorderModalProps> = ({ hit, remaining, onClose }) => {
  const [result, setResult] = useState<MrburCartResult | null>(null);

  useEffect(() => {
    setResult(addItemToMrburCart(hit.item));
    // Only re-run when the item being shown changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit.item.id]);

  const handleViewCart = () => {
    const url = result?.searchUrl ?? addItemToMrburCart(hit.item).searchUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const extraCount = remaining - 1;

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
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors shrink-0">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Only <span className="font-bold text-slate-800">{hit.item.quantity}</span> left in stock.
            We've queued <span className="font-bold text-slate-800">{hit.item.name}</span> to add to your
            cart on <span className="font-semibold">mrbur.shop</span>.
          </p>
          {extraCount > 0 && (
            <p className="text-xs text-slate-400">
              {extraCount} more low-stock item{extraCount === 1 ? '' : 's'} to review after this one.
            </p>
          )}
        </div>

        <div className="p-4 flex gap-3 bg-slate-50/50 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleViewCart}
            className="flex-1 py-2.5 rounded-xl bg-[#004aad] text-white text-sm font-bold hover:bg-[#003a8a] transition-colors flex items-center justify-center gap-1.5"
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
