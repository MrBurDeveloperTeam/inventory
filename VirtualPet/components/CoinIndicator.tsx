
import React from 'react';

interface CoinIndicatorProps {
  amount: number;
}

const CoinIndicator: React.FC<CoinIndicatorProps> = ({ amount }) => {
  return (
    <div className="absolute right-16 top-3 z-40 flex cursor-default select-none items-center gap-1 rounded-full border border-white/40 bg-white/30 px-2 py-1 text-slate-800 shadow-lg backdrop-blur-md transition-all duration-700 hover:scale-105 hover:bg-white/40 md:right-32 md:top-8 md:gap-2 md:px-4 md:py-2">
      <div className="text-base drop-shadow-sm filter md:text-2xl">💰</div>

      <span className="text-sm font-black tracking-wide md:text-xl">
        {amount}
      </span>
    </div>
  );
};

export default CoinIndicator;
