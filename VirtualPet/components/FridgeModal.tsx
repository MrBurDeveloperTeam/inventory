
import React from 'react';
import { FoodItem } from '../types';

interface FridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: FoodItem[];
  inventory: Record<string, number>;
  onFeed: (item: FoodItem) => void;
  onOpenShop: () => void;
}

export const FridgeModal: React.FC<FridgeModalProps> = ({ 
  isOpen, 
  onClose, 
  items, 
  inventory, 
  onFeed,
  onOpenShop
}) => {
  if (!isOpen) return null;

  // Only show items user actually owns
  const ownedItems = items.filter(item => (inventory[item.id] || 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden transform transition-all scale-100 border-4 border-cyan-100">
        
        {/* Header */}
        <div className="p-4 bg-cyan-400 text-white flex justify-between items-center shadow-md z-10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">❄️</span>
            <h2 className="text-2xl font-black tracking-wide">My Fridge</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/>
                <path d="M6 6 18 18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-cyan-50 no-scrollbar">
          {ownedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                <span className="text-6xl mb-4">🕸️</span>
                <p className="text-xl font-bold">Your fridge is empty!</p>
                <button 
                  onClick={onOpenShop}
                  className="mt-4 px-6 py-2 bg-cyan-500 text-white rounded-full font-bold hover:bg-cyan-600 transition-colors shadow-sm active:scale-95"
                >
                  Go to Shop
                </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {ownedItems.map((item) => {
                const count = inventory[item.id];
                return (
                  <button 
                    key={item.id} 
                    onClick={() => onFeed(item)}
                    className="relative flex flex-col items-center justify-center p-2 transition-transform duration-200 group active:scale-95 hover:scale-110"
                  >
                      <div className="text-5xl mb-2 drop-shadow-sm filter">{item.icon}</div>
                      
                      <div className="text-sm font-bold text-slate-600 tracking-wider">
                          {item.label} <span className="text-cyan-600">x{count}</span>
                      </div>
                  </button>
                );
              })}
              
              {/* Quick Shop Access Tile */}
              <button 
                onClick={onOpenShop}
                className="relative flex items-center justify-center pb-5 transition-all duration-200 group active:scale-95 hover:scale-105 opacity-50 hover:opacity-100 rounded-3xl"
                title="Buy More"
              >
                  <div className="text-5xl drop-shadow-sm filter">➕</div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
