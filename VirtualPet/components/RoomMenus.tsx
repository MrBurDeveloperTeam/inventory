import React, { useRef } from 'react';
import { Plus } from 'lucide-react';
import { FoodItem, ToolType } from '../types';

interface FoodMenuProps {
    onDragStart: (e: React.PointerEvent, item: FoodItem) => void;
    inventory: Record<string, number>;
    onOpenShop: () => void;
    items: FoodItem[];
}

const isKitchenFoodItem = (item: FoodItem) => {
    const category = item.category.toLowerCase();
    const id = item.id.toLowerCase();

    return (
        category !== 'toys' &&
        category !== 'toy' &&
        category !== 'soap' &&
        category !== 'beds' &&
        category !== 'bed' &&
        !id.startsWith('ball_') &&
        !id.startsWith('bed_') &&
        id !== 'soap' &&
        id !== 'soap2'
    );
};

export const FoodMenu: React.FC<FoodMenuProps> = ({ onDragStart, inventory, onOpenShop, items }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const availableItems = items.filter(item => isKitchenFoodItem(item) && (inventory[item.id] || 0) > 0);

    const handleWheel = (e: React.WheelEvent) => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft += e.deltaY;
        }
    };

    return (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-300 pointer-events-none">
            <div className="pointer-events-auto flex max-w-[min(92vw,430px)] items-center gap-3 rounded-2xl border border-white/50 bg-white/60 backdrop-blur-xl p-2 shadow-2xl shadow-orange-900/10 backdrop-blur-xl">
                <div
                    ref={scrollRef}
                    onWheel={handleWheel}
                    className="no-scrollbar flex h-22 min-w-0 flex-1 snap-x items-center gap-4 overflow-x-auto px-4 pt-3"
                >
                    {availableItems.length === 0 && (
                        <button
                            type="button"
                            onClick={onOpenShop}
                            className="flex h-16 w-44 shrink-0 mb-2 items-center justify-center rounded-2xl border border-dashed border-orange-300 bg-orange-50/70 px-4 text-center text-[15px] font-bold text-orange-700 tracking-wider transition-colors hover:bg-orange-100"
                        >
                            No food yet!
                        </button>
                    )}
                    {availableItems.map((item) => (
                        <div
                            key={item.id}
                            onPointerDown={(e) => onDragStart(e, item)}
                            className="relative flex h-16 w-16 shrink-0 snap-center cursor-grab items-center justify-center transition-all hover:-translate-y-0.5 active:cursor-grabbing active:scale-95"
                        >
                            <div className="select-none touch-none text-4xl drop-shadow-sm">{item.icon}</div>
                            <div className="pointer-events-none absolute -right-0 -top-0 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 text-[11px] font-black text-white shadow">
                                {inventory[item.id]}
                            </div>
                        </div>
                    ))}
                    {availableItems.length > 0 && (
                        <button
                            type="button"
                            onClick={onOpenShop}
                            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl mb-2 border border-dashed border-slate-300 bg-white/70 text-slate-400 transition-all hover:border-orange-300 hover:text-orange-500 active:scale-95"
                            aria-label="Buy more food"
                        >
                            <Plus className="h-8 w-8" strokeWidth={3} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

interface BathroomMenuProps {
    onDragStart: (e: React.PointerEvent, tool: ToolType) => void;
    soapInventory: Record<'soap' | 'soap2', number>;
    isSoapedUp?: boolean;
    isDirty?: boolean;
}

const BATHROOM_TOOL_ICONS: Record<ToolType, { src: string; alt: string }> = {
    soap: { src: '/pets/soap.png', alt: 'Soap' },
    soap2: { src: '/pets/soap2.png', alt: 'Premium Soap' },
    shower: { src: '/pets/shower.png', alt: 'Shower' },
};

export const BathroomMenu: React.FC<BathroomMenuProps> = ({ onDragStart, soapInventory, isSoapedUp, isDirty }) => (
    <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="bg-white/60 backdrop-blur-xl p-4 rounded-2xl shadow-xl flex gap-6 border border-white/50 items-end">
            {(['soap', 'soap2'] as const).map((tool) => {
                const count = soapInventory[tool] || 0;
                const disabled = !!isSoapedUp || count <= 0;
                return (
                    <div
                        key={tool}
                        onPointerDown={(e) => !disabled && onDragStart(e, tool)}
                        className={`relative flex flex-col items-center gap-1 transition-all duration-300 ${
                            disabled
                                ? 'opacity-40 scale-90 grayscale cursor-not-allowed'
                                : 'cursor-grab active:cursor-grabbing hover:scale-110'
                        }`}
                    >
                        <div className={`select-none touch-none ${isDirty && !isSoapedUp && count > 0 ? 'animate-breathe [animation-duration:800ms] ease-in-out' : ''}`}>
                            <img
                                src={BATHROOM_TOOL_ICONS[tool].src}
                                alt={BATHROOM_TOOL_ICONS[tool].alt}
                                draggable={false}
                                className="h-[72px] w-[72px] object-contain drop-shadow-md"
                            />
                        </div>
                        <span className={`text-[13px] tracking-wider font-bold uppercase transition-colors ${!disabled ? 'text-pink-500' : 'text-slate-400'}`}>
                            {tool === 'soap' ? 'Soap' : 'Soap+'}
                        </span>
                        <span className="pointer-events-none absolute right-1 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white shadow">
                            {count}
                        </span>
                    </div>
                );
            })}

            <div
                onPointerDown={(e) => isSoapedUp && onDragStart(e, 'shower')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                    isSoapedUp
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'opacity-30 grayscale cursor-not-allowed'
                }`}
            >
                <div className={`select-none touch-none transition-all ${isSoapedUp ? 'animate-breathe [animation-duration:800ms] ease-in-out' : ''}`}>
                    <img
                        src={BATHROOM_TOOL_ICONS.shower.src}
                        alt={BATHROOM_TOOL_ICONS.shower.alt}
                        draggable={false}
                        className="h-16 w-16 object-contain drop-shadow-md"
                    />
                </div>
                <span className={`text-[13px] pt-1 tracking-wider font-bold uppercase transition-colors ${isSoapedUp ? 'text-cyan-600' : 'text-slate-400'}`}>
                    Shower
                </span>
            </div>
        </div>
    </div>
);

interface BathroomSoapStoreProps {
    isOpen: boolean;
    coins: number;
    soapInventory: Record<'soap' | 'soap2', number>;
    onClose: () => void;
    onBuy: (tool: 'soap' | 'soap2') => void;
}

const SOAP_STORE_ITEMS = [
    { tool: 'soap' as const, label: 'Normal Soap', price: 3, src: '/pets/soap.png', description: 'Standard clean' },
    { tool: 'soap2' as const, label: 'Power Soap', price: 8, src: '/pets/soap2.png', description: 'More hygiene' },
];

export const BathroomSoapStore: React.FC<BathroomSoapStoreProps> = ({ isOpen, coins, soapInventory, onClose, onBuy }) => {
    if (!isOpen) return null;

    return (
        <div className="absolute bottom-36 left-1/2 z-40 w-[min(92vw,360px)] -translate-x-1/2 rounded-3xl border border-white/60 bg-white/85 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Soap Store</h3>
                    <p className="text-xs font-semibold text-slate-500">{coins} coins available</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full px-3 py-1 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                >
                    Close
                </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
                {SOAP_STORE_ITEMS.map((item) => {
                    const canBuy = coins >= item.price;
                    return (
                        <button
                            key={item.tool}
                            type="button"
                            onClick={() => canBuy && onBuy(item.tool)}
                            className={`rounded-2xl border p-3 text-left transition-all ${
                                canBuy
                                    ? 'border-white bg-white/90 shadow hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0'
                                    : 'cursor-not-allowed border-slate-200 bg-slate-100/80 opacity-60'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <img src={item.src} alt="" draggable={false} className="h-14 w-14 object-contain drop-shadow-md" />
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-700">{item.price}</span>
                            </div>
                            <div className="mt-2 text-xs font-black text-slate-700">{item.label}</div>
                            <div className="text-[11px] font-semibold text-slate-500">{item.description}</div>
                            <div className="mt-1 text-[11px] font-bold text-slate-400">Owned: {soapInventory[item.tool] || 0}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

interface GamesMenuProps {
    onStartGame: (gameId: string) => void;
}

export const GamesMenu: React.FC<GamesMenuProps> = ({ onStartGame }) => (
    <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="bg-violet-900/60 backdrop-blur-xl p-4 rounded-3xl shadow-xl border border-violet-500/50 flex gap-4">
            <button
                onClick={() => onStartGame('flappy')}
                className="flex flex-col items-center group transition-all duration-200 hover:scale-105 active:scale-95"
            >
                <div className="w-20 h-20 bg-gradient-to-br from-yellow-300 to-orange-400 rounded-2xl shadow-lg flex items-center justify-center text-3xl font-black text-white group-hover:-rotate-12 transition-transform border-4 border-white/50">
                    F
                </div>
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Flappy</span>
            </button>

            <button
                onClick={() => onStartGame('paccat')}
                className="flex flex-col items-center group transition-all duration-200 hover:scale-105 active:scale-95"
            >
                <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl shadow-lg flex items-center justify-center text-3xl font-black text-white group-hover:rotate-12 transition-transform border-4 border-white/50">
                    P
                </div>
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Pac-Cat</span>
            </button>

            <button
                onClick={() => onStartGame('tetris')}
                className="flex flex-col items-center group transition-all duration-200 hover:scale-105 active:scale-95"
            >
                <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-pink-500 rounded-2xl shadow-lg flex items-center justify-center text-3xl font-black text-white group-hover:translate-y-1 transition-transform border-4 border-white/50">
                    T
                </div>
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Tetris</span>
            </button>
        </div>
    </div>
);
