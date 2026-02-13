
import React from 'react';
import { ToyItem } from '../types';

interface ToyShopModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: ToyItem[];
    inventory: Record<string, number>;
    coins: number;
    currentLevel: number;
    activeBallId: string;
    onBuy: (toy: ToyItem) => void;
    onSelect: (id: string) => void;
}

const ToyShopModal: React.FC<ToyShopModalProps> = ({
    isOpen,
    onClose,
    items,
    inventory,
    coins,
    currentLevel,
    activeBallId,
    onBuy,
    onSelect
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden border-4 border-pink-100">

                {/* Header */}
                <div className="p-5 bg-pink-500 text-white flex justify-between items-center shadow-md shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🧸</span>
                        <h2 className="text-2xl font-black tracking-wide">Toy Store</h2>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="bg-black/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                            <span className="text-sm">💰</span>
                            <span className="font-bold text-base">{coins}</span>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* List of Toys */}
                <div className="p-4 bg-pink-50 max-h-[60vh] overflow-y-auto no-scrollbar grid grid-cols-2 gap-3">
                    {items.map((toy) => {
                        const isActive = activeBallId === toy.id;
                        const isOwned = (inventory[toy.id] || 0) > 0 || toy.price === 0 || isActive;
                        const isLocked = (toy.levelReq || 1) > currentLevel;
                        const canAfford = coins >= toy.price;

                        return (
                            <div
                                key={toy.id}
                                className={`flex flex-col items-center p-4 bg-white rounded-2xl border-2 transition-all relative ${isActive ? 'border-pink-500 shadow-lg' : 'border-pink-100'
                                    } ${isLocked ? 'opacity-60' : 'hover:-translate-y-1'}`}
                            >
                                {isLocked && (
                                    <div className="absolute inset-0 bg-white/40 z-10 flex items-center justify-center rounded-2xl">
                                        <span className="bg-slate-800 text-white text-[10px] font-black px-2 py-0.5 rounded-full scale-125">
                                            Lvl {toy.levelReq} 🔒
                                        </span>
                                    </div>
                                )}

                                <div className={`w-16 h-16 mb-3 flex items-center justify-center transition-all ${toy.icon ? '' : 'rounded-full shadow-inner border-2 border-white/50'}`}
                                    style={{ background: toy.icon ? 'none' : toy.color }}
                                >
                                    {toy.icon && <span className="text-[64px] leading-none drop-shadow-md select-none">{toy.icon}</span>}
                                </div>

                                <span className="text-sm font-bold text-slate-700 mb-2">{toy.label}</span>

                                {isOwned ? (
                                    <button
                                        onClick={() => onSelect(toy.id)}
                                        className={`w-full py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${isActive
                                            ? 'bg-pink-100 text-pink-500 cursor-default'
                                            : 'bg-pink-500 text-white hover:bg-pink-600 active:scale-95 shadow-sm'
                                            }`}
                                    >
                                        {isActive ? 'Active' : 'Select'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => canAfford && onBuy(toy)}
                                        disabled={!canAfford}
                                        className={`w-full py-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all ${canAfford
                                            ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95 shadow-sm'
                                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            }`}
                                    >
                                        <span>💰</span>
                                        <span>{toy.price}</span>
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="p-4 bg-white border-t border-pink-100 text-center">
                    <p className="text-[10px] font-bold text-pink-300 uppercase tracking-widest">Select your favorite ball to play!</p>
                </div>
            </div>
        </div>
    );
};

export default ToyShopModal;
