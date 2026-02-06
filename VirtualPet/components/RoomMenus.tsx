
import React, { useRef } from 'react';
import { FoodItem, ToolType } from '../types';
import { FOOD_ITEMS } from '../constants';

interface FoodMenuProps {
    onDragStart: (e: React.PointerEvent, item: FoodItem) => void;
    inventory: Record<string, number>;
    onOpenShop: () => void;
    onOpenFridge: () => void;
}

export const FoodMenu: React.FC<FoodMenuProps> = ({ onDragStart, inventory, onOpenShop, onOpenFridge }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Filter items to show only if user has at least 1
    const availableItems = FOOD_ITEMS.filter(item => (inventory[item.id] || 0) > 0);

    const handleWheel = (e: React.WheelEvent) => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft += e.deltaY;
        }
    };

    return (
        <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center items-end animate-in slide-in-from-bottom-10 fade-in duration-300 pointer-events-none gap-4 px-4">
            
            {/* Fridge Button */}
            <button
                onClick={onOpenFridge}
                className="bg-cyan-400 hover:bg-cyan-500 text-white w-24 h-24 rounded-3xl shadow-xl flex flex-col items-center justify-center transition-all hover:scale-110 active:scale-95 pointer-events-auto border-4 border-white"
            >
                <span className="text-5xl drop-shadow-md mb-1">❄️</span>
                <span className="text-xs font-black uppercase tracking-wide">Fridge</span>
            </button>

            {/* Scrollable Food List */}
            <div 
                ref={scrollRef}
                onWheel={handleWheel}
                className="bg-white/80 backdrop-blur-xl p-4 rounded-3xl shadow-xl flex gap-3 overflow-x-auto max-w-[35vw] border border-white/60 pointer-events-auto no-scrollbar snap-x h-24 items-center"
            >
                {availableItems.length === 0 && (
                    <div className="text-slate-500 text-sm font-bold flex items-center justify-center px-4 w-40 text-center h-full">
                        Your fridge is empty!
                    </div>
                )}
                {availableItems.map((item) => (
                    <div 
                        key={item.id}
                        onPointerDown={(e) => onDragStart(e, item)}
                        className="relative flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-white/50 cursor-grab active:cursor-grabbing hover:scale-105 transition-all shrink-0 w-16 h-16 snap-center"
                    >
                        <div className="text-4xl filter drop-shadow-sm select-none touch-none">{item.icon}</div>
                        
                        {/* Quantity Badge */}
                        <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-semibold w-5 h-5 flex items-center justify-center rounded-full pointer-events-none z-10 border border-white">
                            {inventory[item.id]}
                        </div>
                    </div>
                ))}
            </div>

            {/* Shop Button */}
            <button
                onClick={onOpenShop}
                className="bg-orange-400 hover:bg-orange-500 text-white w-24 h-24 rounded-3xl shadow-xl flex flex-col items-center justify-center transition-all hover:scale-110 active:scale-95 pointer-events-auto border-4 border-white"
            >
                <span className="text-5xl drop-shadow-md mb-1">🏪</span>
                <span className="text-xs font-black uppercase tracking-wide">Shop</span>
            </button>
        </div>
    );
};

interface BathroomMenuProps {
    onDragStart: (e: React.PointerEvent, tool: ToolType) => void;
    isSoapedUp?: boolean;
    isDirty?: boolean;
}

export const BathroomMenu: React.FC<BathroomMenuProps> = ({ onDragStart, isSoapedUp, isDirty }) => (
    <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="bg-white/60 backdrop-blur-xl p-4 rounded-2xl shadow-xl flex gap-8 border border-white/50 items-end">
            {/* Soap Item */}
            <div 
                onPointerDown={(e) => !isSoapedUp && onDragStart(e, 'soap')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                    isSoapedUp 
                    ? 'opacity-40 scale-90 grayscale cursor-not-allowed' 
                    : 'cursor-grab active:cursor-grabbing hover:scale-110'
                }`}
            >
                <div className={`text-5xl select-none touch-none 
                    ${isDirty && !isSoapedUp ? 'animate-breathe [animation-duration:800ms] ease-in-out' : ''}`}>
                    🧼
                </div>
                <span className={`text-[10px] pt-2 font-bold uppercase transition-colors ${!isSoapedUp ? 'text-pink-500' : 'text-slate-400'}`}>
                    Soap
                </span>
            </div>

            <div 
                onPointerDown={(e) => isSoapedUp && onDragStart(e, 'shower')}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                    isSoapedUp 
                    ? 'cursor-grab active:cursor-grabbing' 
                    : 'opacity-30 grayscale cursor-not-allowed'
                }`}
            >
                <div className={`text-5xl select-none touch-none transition-all 
                    ${isSoapedUp ? 'animate-breathe [animation-duration:800ms] ease-in-out' : ''}`}>
                    🚿
                </div>
                <span className={`text-[10px] pt-2 font-bold uppercase transition-colors ${isSoapedUp ? 'text-cyan-600' : 'text-slate-400'}`}>
                    Shower
                </span>
            </div>
        </div>
    </div>
);

interface GamesMenuProps {
    onStartGame: (gameId: string) => void;
}

export const GamesMenu: React.FC<GamesMenuProps> = ({ onStartGame }) => (
    <div className="absolute bottom-6 left-0 right-0 z-30 flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-300">
         <div className="bg-violet-900/60 backdrop-blur-xl p-4 rounded-3xl shadow-xl border border-violet-500/50 flex gap-4">
            
            {/* Flappy Cat */}
            <button 
                onClick={() => onStartGame('flappy')}
                className="flex flex-col items-center group transition-all duration-200 hover:scale-105 active:scale-95"
            >
                <div className="w-20 h-20 bg-gradient-to-br from-yellow-300 to-orange-400 rounded-2xl shadow-lg flex items-center justify-center text-4xl group-hover:-rotate-12 transition-transform border-4 border-white/50">
                    🕊️
                </div>
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Flappy</span>
            </button>

            {/* Pac-Cat */}
            <button 
                onClick={() => onStartGame('paccat')}
                className="flex flex-col items-center group transition-all duration-200 hover:scale-105 active:scale-95"
            >
                <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl shadow-lg flex items-center justify-center text-4xl group-hover:rotate-12 transition-transform border-4 border-white/50">
                    👻
                </div>
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Pac-Cat</span>
            </button>

            {/* Tetris */}
            <button 
                onClick={() => onStartGame('tetris')}
                className="flex flex-col items-center group transition-all duration-200 hover:scale-105 active:scale-95"
            >
                 <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-pink-500 rounded-2xl shadow-lg flex items-center justify-center text-4xl group-hover:translate-y-1 transition-transform border-4 border-white/50">
                    🧱
                </div>
                <span className="text-[10px] font-black text-white mt-1.5 uppercase tracking-wide drop-shadow-md">Tetris</span>
            </button>

         </div>
    </div>
);
