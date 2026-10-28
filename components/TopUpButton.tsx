import React from 'react';
import { ShoppingCart } from 'lucide-react';
import type { Item } from '../types';

interface TopUpButtonProps {
  item: Item;
  /** From useShopTopUp: opens the item's MR.BUR shop page in a new tab. */
  onTopUp: (item: Item) => void;
  /** From useShopTopUp: true when the item matches a known shop product. */
  exactMatch: boolean;
  /** 'icon' = compact round icon (table rows); 'pill' = icon + label (mobile cards). */
  variant?: 'icon' | 'pill';
  className?: string;
}

/**
 * Quick "buy more" shortcut shown on an inventory item row. It never changes
 * stock: it only opens the MR.BUR shop for this item, where the shopper adds
 * it to their cart. Stock goes up later through the normal purchase sync /
 * Receive Stock flow.
 */
const TopUpButton: React.FC<TopUpButtonProps> = ({
  item,
  onTopUp,
  exactMatch,
  variant = 'icon',
  className = '',
}) => {
  const title = exactMatch
    ? `Top up "${item.name}" on MR.BUR shop`
    : `Search "${item.name}" on MR.BUR shop`;

  const handleClick = (e: React.MouseEvent) => {
    // Rows/cards are clickable (expand details) — don't trigger that.
    e.stopPropagation();
    onTopUp(item);
  };

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={title}
        aria-label={title}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-bold active:scale-95 hover:bg-emerald-100 transition-colors ${className}`}
      >
        <ShoppingCart className="w-3.5 h-3.5" />
        Top up
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={`w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors ${className}`}
    >
      <ShoppingCart className="w-3.5 h-3.5" />
    </button>
  );
};

export default TopUpButton;
