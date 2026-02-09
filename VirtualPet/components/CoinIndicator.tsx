
import React from 'react';

interface CoinIndicatorProps {
  amount: number;
}

const CoinIndicator: React.FC<CoinIndicatorProps> = ({ amount }) => {
  return (
    <div className="absolute top-8 right-32 z-40 flex items-center gap-2 bg-white/30 backdrop-blur-md px-4 py-2 rounded-full border border-white/40 shadow-lg text-slate-800 animate-in fade-in slide-in-from-right-8 duration-700 delay-100 transition-all hover:scale-105 hover:bg-white/40 cursor-default select-none">
      <div className="text-2xl drop-shadow-sm filter">💰</div>
      <span className="font-black text-xl tracking-wide">{amount}</span>
    </div>
  );
};

export default CoinIndicator;
