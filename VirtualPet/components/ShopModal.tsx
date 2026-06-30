import React, { useEffect, useMemo, useState } from 'react';
import {
  Apple,
  ArrowLeft,
  BedDouble,
  Candy,
  Coffee,
  Coins,
  CupSoda,
  Drumstick,
  Gamepad2,
  Lock,
  ShoppingBag,
  Smile,
  Utensils,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { FoodItem } from '../types';
import { useGameState } from '../hooks/useGameState';
import { TOY_ITEMS } from '../constants';
import { AiOutlineShop } from 'react-icons/ai';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: FoodItem[];
  inventory: Record<string, number>;
  activeBedId: string | null;
  activeBallId: string;
  coins: number;
  currentLevel: number;
  onBuy: (item: FoodItem) => void;
  onBuyBed: (bed: FoodItem) => void;
  onSelectBed: (id: string) => void;
  onBuyToy: (item: FoodItem) => void;
  onSelectToy: (id: string) => void;
  isLoading?: boolean;
}

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  Healthy: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', accent: 'bg-emerald-100' },
  Breakfast: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', accent: 'bg-yellow-100' },
  Meals: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', accent: 'bg-orange-100' },
  Drinks: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', accent: 'bg-sky-100' },
  Sweets: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', accent: 'bg-pink-100' },
  Toys: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', accent: 'bg-slate-100' },
  Beds: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', accent: 'bg-indigo-100' },
  Default: { bg: 'bg-stone-50', border: 'border-stone-200', text: 'text-stone-700', accent: 'bg-stone-100' },
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Healthy: Apple,
  Breakfast: Coffee,
  Meals: Drumstick,
  Drinks: CupSoda,
  Sweets: Candy,
  Toys: Gamepad2,
  Beds: BedDouble,
  Default: ShoppingBag,
};

const CATEGORY_ORDER = ['Healthy', 'Breakfast', 'Meals', 'Drinks', 'Sweets', 'Toys', 'Beds'];

const SHOP_BUTTONS = {
  buy: 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 active:scale-95',
  select: 'bg-orange-200 text-amber-800 border-2 border-amber-700 shadow-lg hover:bg-orange-300 active:scale-95',
  active: 'border-2 border-orange-400 cursor-default bg-amber-100 shadow-lg text-orange-600',
  disabled: 'cursor-not-allowed bg-slate-100 text-slate-400',
  locked: 'cursor-not-allowed bg-slate-200 text-slate-500',
};

const findToyByShopItem = (item: Pick<FoodItem, 'id' | 'label'>) => {
  const normalizedLabel = item.label.toLowerCase();
  const normalizedId = item.id.toLowerCase();

  return TOY_ITEMS.find((toy) =>
    toy.id.toLowerCase() === normalizedId ||
    toy.label.toLowerCase() === normalizedLabel ||
    toy.label.toLowerCase().replace(/\s+/g, '_') === normalizedId
  );
};

const ToyVisual = ({ item, size = 'large' }: { item: FoodItem; size?: 'small' | 'large' }) => {
  const toy = findToyByShopItem(item);
  if (!toy) {
    return <span className={size === 'large' ? 'text-6xl drop-shadow-sm' : 'text-4xl drop-shadow-sm'}>{item.icon}</span>;
  }

  if (toy.icon) {
    return <span className={`${size === 'large' ? 'text-[64px]' : 'text-4xl'} leading-none drop-shadow-md select-none`}>{toy.icon}</span>;
  }

  return (
    <span
      className={`${size === 'large' ? 'h-16 w-16' : 'h-11 w-11'} rounded-full border-2 border-white/50 shadow-inner`}
      style={{ background: toy.color }}
    />
  );
};

const ShopModal: React.FC<ShopModalProps> = ({
  isOpen,
  onClose,
  items,
  inventory,
  activeBedId,
  activeBallId,
  coins,
  currentLevel,
  onBuy,
  onBuyBed,
  onSelectBed,
  onBuyToy,
  onSelectToy,
  isLoading = false
}) => {
  const { currencyCode, currencyRate } = useGameState();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const formatPrice = (baseUSD: number) => {
    const converted = baseUSD * currencyRate;
    return converted % 1 === 0 ? converted.toFixed(0) : converted.toFixed(2).replace(/\.?0+$/, '');
  };

  const categories = useMemo(() => {
    const available = new Set(items.map(item => item.category));
    available.delete('Soap');
    return [
      ...CATEGORY_ORDER.filter(category => available.has(category)),
      ...Array.from(available).filter(category => !CATEGORY_ORDER.includes(category)),
    ];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'Beds') return [];
    return items.filter(item => item.category === selectedCategory);
  }, [items, selectedCategory]);

  const bedItems = useMemo(() => items.filter((item) => item.category === 'Beds'), [items]);

  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => setSelectedCategory(null), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedStyle = CATEGORY_STYLES[selectedCategory || 'Default'] || CATEGORY_STYLES.Default;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[30px] border-4 border-orange-100 bg-white shadow-2xl">
        <div className="relative overflow-hidden bg-gradient-to-r from-orange-400 to-amber-400 px-5 py-4 text-white">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15" />
          <div className="absolute left-40 bottom-0 h-14 w-14 translate-y-1/2 rounded-full bg-white/10" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {selectedCategory ? (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95"
                  aria-label="Back to categories"
                >
                  <ArrowLeft className="h-7 w-7" strokeWidth={3} />
                </button>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 shadow-inner">
                  <AiOutlineShop className="h-9 w-9" strokeWidth={10} />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-black tracking-wide text-slate-900">
                  {selectedCategory || 'Shop'}
                </h2>
                <p className="text-sm font-bold text-orange-950/70">
                  {selectedCategory ? `${selectedCategory === 'Beds' ? bedItems.length : filteredItems.length} items available` : 'Pick a shelf, then buy supplies'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-orange-900/20 px-4 py-2 text-white shadow-inner">
                <div className="text-xl drop-shadow-sm filter">💰</div>
                <span className="font-black text-xl tracking-wide">{coins}</span>
              </div>
              <button
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/20 active:scale-95"
                aria-label="Close market"
              >
                <X className="h-7 w-7" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-orange-50 to-white p-5 no-scrollbar">
          {isLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="h-12 w-12 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
              <p className="text-lg font-black text-orange-600">Loading items...</p>
            </div>
          )}

          {!isLoading && !selectedCategory && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {categories.map((cat) => {
                const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES.Default;
                const categoryItems = cat === 'Beds' ? [] : items.filter(item => item.category === cat);
                const Icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS.Default;
                const itemCount = cat === 'Beds' ? bedItems.length : categoryItems.length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`group relative min-h-40 overflow-hidden rounded-[28px] border-2 ${style.border} ${style.bg} p-5 text-left shadow-lg shadow-orange-900/5 transition-all hover:-translate-y-1 hover:shadow-xl active:scale-95`}
                  >
                    <div className={`pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full ${style.accent} opacity-60 transition-transform duration-300 group-hover:scale-110`} />
                    <div className="relative z-10 flex h-full flex-col justify-between gap-7">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${style.accent} shadow-inner`}>
                          <Icon className={`h-8 w-8 ${style.text}`} strokeWidth={2.2} />
                        </div>
                        <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                          {itemCount} items
                        </span>
                      </div>
                      <div>
                        <div className={`text-2xl font-black uppercase tracking-wide ${style.text}`}>{cat}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isLoading && selectedCategory === 'Beds' && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {bedItems.map((bed) => {
                const isOwned = bed.price === 0 || (inventory[bed.id] || 0) > 0;
                const isActive = activeBedId === bed.id;
                const isLocked = (bed.levelReq || 1) > currentLevel;
                const actualPrice = bed.price * currencyRate;
                const canAfford = coins >= actualPrice;

                return (
                  <div
                    key={bed.id}
                    className={`relative flex min-h-56 flex-col rounded-[26px] border ${selectedStyle.border} bg-white p-4 text-center shadow-lg shadow-orange-900/5 transition-all ${
                      isLocked ? 'opacity-65 grayscale' : 'hover:-translate-y-1 hover:shadow-xl'
                    }`}
                  >
                    {isOwned && !isLocked && (
                      <div className="absolute right-3 top-3 z-10 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow">
                        Owned
                      </div>
                    )}

                    {isLocked && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[26px] bg-white/55">
                        <div className="flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white shadow-md">
                          <Lock className="h-3.5 w-3.5" strokeWidth={3} />
                          Lvl {bed.levelReq}
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex h-20 items-center justify-center">
                      <img src={bed.imageSrc} alt="" draggable={false} className="h-20 w-28 object-contain drop-shadow-md" />
                    </div>
                    <div className="mt-3 truncate text-base font-black text-slate-700">{bed.label}</div>

                    <div className="my-3 flex min-h-8 flex-wrap items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-xs font-black text-indigo-700">
                        <Zap className="h-3.5 w-3.5" strokeWidth={3} />
                        +{bed.energyGain || 1}% sleep
                      </span>
                    </div>

                    {isOwned ? (
                      <button
                        onClick={() => !isActive && onSelectBed(bed.id)}
                        disabled={isActive}
                        className={`mt-auto rounded-2xl px-3 py-2.5 text-sm font-black transition-all ${
                          isActive
                            ? SHOP_BUTTONS.active
                            : SHOP_BUTTONS.select
                        }`}
                      >
                        {isActive ? 'Active' : 'Select'}
                      </button>
                    ) : (
                      <button
                        onClick={() => !isLocked && canAfford && onBuyBed(bed)}
                        disabled={isLocked || !canAfford}
                        className={`mt-auto rounded-2xl px-3 py-2.5 text-sm font-black transition-all ${
                          !isLocked && canAfford
                            ? SHOP_BUTTONS.buy
                            : SHOP_BUTTONS.disabled
                        }`}
                      >
                        {isLocked ? 'Locked' : `${currencyCode} ${formatPrice(bed.price)}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!isLoading && selectedCategory && selectedCategory !== 'Beds' && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filteredItems.map((item) => {
                const toy = findToyByShopItem(item);
                const isToy = !!toy;
                const toyId = toy?.id || item.id;
                const ownedCount = isToy ? Math.min(1, inventory[toyId] || inventory[item.id] || 0) : inventory[item.id] || 0;
                const isActiveToy = isToy && activeBallId === toyId;
                const isOwnedToy = isToy && (ownedCount > 0 || item.price === 0);
                const isLocked = (item.levelReq || 1) > currentLevel;
                const actualPrice = item.price * currencyRate;
                const canAfford = coins >= actualPrice;
                const isDisabled = isLocked || !canAfford;

                return (
                  <div
                    key={item.id}
                    className={`relative flex min-h-56 flex-col rounded-[26px] border ${selectedStyle.border} bg-white p-4 text-center shadow-lg shadow-orange-900/5 transition-all ${
                      isLocked ? 'opacity-65 grayscale' : 'hover:-translate-y-1 hover:shadow-xl'
                    }`}
                  >
                    {ownedCount > 0 && !isLocked && !isToy && (
                      <div className="absolute right-3 top-3 z-10 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow">
                        x{ownedCount}
                      </div>
                    )}
                    {isOwnedToy && !isLocked && (
                      <div className="absolute right-3 top-3 z-10 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-white shadow">
                        Owned
                      </div>
                    )}

                    {isLocked && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[26px] bg-white/55">
                        <div className="flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white shadow-md">
                          <Lock className="h-3.5 w-3.5" strokeWidth={3} />
                          Lvl {item.levelReq}
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex h-20 items-center justify-center">
                      <ToyVisual item={item} />
                    </div>
                    <div className="mt-3 truncate text-base font-black text-slate-700">{item.label}</div>

                    <div className="my-3 flex min-h-8 flex-wrap items-center justify-center gap-2">
                      {item.hunger > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-xs font-black text-orange-700">
                          <Utensils className="h-3.5 w-3.5" strokeWidth={2.8} />
                          +{item.hunger}%
                        </span>
                      )}
                      {!!item.happiness && item.happiness > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2 py-1 text-xs font-black text-pink-700">
                          <Smile className="h-3.5 w-3.5" strokeWidth={2.8} />
                          +{item.happiness}%
                        </span>
                      )}
                    </div>

                    {isToy && isOwnedToy ? (
                      <button
                        onClick={() => !isActiveToy && onSelectToy(toyId)}
                        disabled={isActiveToy}
                        className={`mt-auto rounded-2xl px-3 py-2.5 text-sm font-black transition-all ${
                          isActiveToy
                            ? SHOP_BUTTONS.active
                            : SHOP_BUTTONS.select
                        }`}
                      >
                        {isActiveToy ? 'Active' : 'Select'}
                      </button>
                    ) : (
                      <button
                        onClick={() => !isDisabled && (isToy ? onBuyToy(item) : onBuy(item))}
                        disabled={isDisabled}
                        className={`mt-auto rounded-2xl px-3 py-2.5 text-sm font-black transition-all ${
                          isLocked
                            ? SHOP_BUTTONS.locked
                            : canAfford
                              ? SHOP_BUTTONS.buy
                              : SHOP_BUTTONS.disabled
                        }`}
                      >
                        {isLocked ? 'Locked' : `${currencyCode} ${formatPrice(item.price)}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShopModal;
