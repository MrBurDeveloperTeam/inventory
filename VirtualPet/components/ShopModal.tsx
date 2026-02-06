
import React, { useState, useMemo, useEffect } from 'react';
import { FoodItem } from '../types';

// Icons for stats
const IconHunger = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);

const IconHappy = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: FoodItem[];
  inventory: Record<string, number>;
  coins: number;
  currentLevel: number;
  onBuy: (item: FoodItem) => void;
}

const CATEGORY_STYLES: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  'Breakfast': { icon: '🍳', bg: 'bg-yellow-100', border: 'border-yellow-200', text: 'text-yellow-700' },
  'Healthy': { icon: '🥗', bg: 'bg-green-100', border: 'border-green-200', text: 'text-green-700' },
  'Meals': { icon: '🍔', bg: 'bg-orange-100', border: 'border-orange-200', text: 'text-orange-700' },
  'Drinks': { icon: '🥤', bg: 'bg-blue-100', border: 'border-blue-200', text: 'text-blue-700' },
  'Sweets': { icon: '🍩', bg: 'bg-pink-100', border: 'border-pink-200', text: 'text-pink-700' },
  'Default': { icon: '🍱', bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-700' }
};

const ShopModal: React.FC<ShopModalProps> = ({ 
  isOpen, 
  onClose, 
  items, 
  inventory, 
  coins,
  currentLevel, 
  onBuy 
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Extract unique categories from items
  const categories = useMemo(() => {
    return Array.from(new Set(items.map(item => item.category)));
  }, [items]);

  // Filter items based on selection
  const filteredItems = useMemo(() => {
    if (!selectedCategory) return [];
    return items.filter(item => item.category === selectedCategory);
  }, [items, selectedCategory]);

  // Reset category when modal is closed/opened
  useEffect(() => {
    if (!isOpen) {
        // slight delay to avoid flicker during close animation
        const t = setTimeout(() => setSelectedCategory(null), 300);
        return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[788px] h-[85vh] flex flex-col overflow-hidden transform transition-all scale-100 border-4 border-orange-100">
        
        {/* Header */}
        <div className="p-5 bg-orange-400 text-white flex justify-between items-center shadow-md z-10 shrink-0">
          <div className="flex items-center gap-3">
            {selectedCategory ? (
                <button 
                    onClick={() => setSelectedCategory(null)}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors mr-1"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
            ) : (
                <span className="text-3xl">🏪</span>
            )}
            <h2 className="text-2xl font-black tracking-wide">
                {selectedCategory ? selectedCategory : "Food Market"}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-black/20 px-4 py-1.5 rounded-full flex items-center gap-2">
                <span className="text-xl">💰</span>
                <span className="font-bold font-mono text-lg">{coins}</span>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-full transition-colors" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/>
                  <path d="M6 6 18 18"/>
                </svg>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-orange-50 no-scrollbar">
          
          {/* CATEGORY VIEW */}
          {!selectedCategory && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 h-full content-start animate-in slide-in-from-left-4 fade-in duration-300">
                  {categories.map(cat => {
                      const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES['Default'];
                      return (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`flex flex-col items-center justify-center p-8 rounded-3xl border-4 transition-all duration-200 shadow-lg hover:-translate-y-1 hover:shadow-xl active:scale-95 ${style.bg} ${style.border} h-48 sm:h-64`}
                          >
                              <div className="text-7xl mb-4 drop-shadow-md filter">{style.icon}</div>
                              <div className={`text-2xl font-black tracking-wide uppercase ${style.text}`}>{cat}</div>
                              <div className="mt-2 text-sm font-bold opacity-60 text-slate-700">
                                  {items.filter(i => i.category === cat).length} items
                              </div>
                          </button>
                      );
                  })}
              </div>
          )}

          {/* ITEM VIEW */}
          {selectedCategory && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in slide-in-from-right-8 fade-in duration-300">
                {filteredItems.map((item) => {
                const ownedCount = inventory[item.id] || 0;
                const isLocked = (item.levelReq || 1) > currentLevel;
                const canAfford = coins >= item.price;
                const isDisabled = isLocked || !canAfford;

                return (
                    <div 
                    key={item.id} 
                    className={`relative flex flex-col items-center p-2 rounded-2xl border-2 transition-all duration-200 bg-white border-orange-100 shadow-lg ${isLocked ? 'grayscale opacity-70' : 'hover:-translate-y-1'}`}
                    >
                        {/* Owned Badge in Shop */}
                        {ownedCount > 0 && !isLocked && (
                            <div className="absolute top-2 right-2 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-green-200 shadow-sm z-10">
                                x{ownedCount}
                            </div>
                        )}

                        {/* Level Lock Overlay */}
                        {isLocked && (
                            <div className="absolute inset-0 bg-slate-100/40 z-20 flex items-center justify-center rounded-2xl pointer-events-none">
                                <div className="bg-slate-800 text-white px-3 py-1 rounded-full text-xs font-bold shadow-md flex items-center gap-1">
                                    <span>🔒</span> Lvl {item.levelReq}
                                </div>
                            </div>
                        )}

                        <div className="text-6xl mb-2 mt-1 drop-shadow-sm">{item.icon}</div>
                        <div className="text-base font-bold text-slate-700 mb-0">{item.label}</div>
                        
                        {/* Stats Display */}
                        <div className="flex flex-wrap justify-center gap-1 mb-2 w-full px-1">
                            {item.hunger > 0 && (
                                <div className="flex items-center gap-1 text-black px-1 py-1 rounded-lg text-[14px] font-semibold tracking-wider" title="Hunger">
                                    <IconHunger /> +{item.hunger}%
                                </div>
                            )}
                            {item.happiness && item.happiness > 0 && (
                                <div className="flex items-center gap-1 text-black px-2 py-1 rounded-lg text-[14px] font-semibold tracking-wider" title="Happiness">
                                    <IconHappy /> +{item.happiness}%
                                </div>
                            )}
                        </div>

                        <button
                        onClick={() => !isDisabled && onBuy(item)}
                        disabled={isDisabled}
                        className={`mt-auto w-full py-1.5 rounded-2xl flex items-center justify-center gap-0.5 transition-colors ${
                            isLocked 
                             ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                             : canAfford 
                                ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-md active:scale-95' 
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                        >
                        {isLocked ? (
                             <span className="font-semibold text-sm">Locked</span>
                        ) : (
                            <>
                                {/* SVG Dollar Icon */}
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33" />
                                </svg>
                                
                                <span className="font-semibold text-lg">{item.price}</span>
                            </>
                        )}
                    </button>
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
