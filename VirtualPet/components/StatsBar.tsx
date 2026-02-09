
import React from 'react';
import { PetStats } from '../types';

interface StatsBarProps {
  stats: PetStats;
}

const IconHunger = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);

const IconClean = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
  </svg>
);

const IconEnergy = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconHappy = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);

const ProgressBar = ({ value, color, icon, label }: { value: number; color: string; icon: React.ReactNode; label: string }) => (
  <div className="flex flex-col w-full group">
    <div className="flex justify-between items-center mb-1 px-1">
      <div className="flex items-center gap-1.5 text-slate-700 font-medium">
         <div className="text-slate-600 group-hover:scale-110 transition-transform duration-300 drop-shadow-sm">{icon}</div>
         <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{label}</span>
      </div>
    </div>
    <div className="h-2 w-full bg-white/50 rounded-full overflow-hidden border border-white/60 shadow-inner backdrop-blur-sm">
      <div 
        className={`h-full ${color} transition-all duration-700 ease-out relative`}
        style={{ width: `${Math.max(5, Math.min(100, value))}%` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
      </div>
    </div>
  </div>
);

const StatsBar: React.FC<StatsBarProps> = ({ stats }) => {
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 w-72 px-5 py-3 bg-white/30 backdrop-blur-md rounded-3xl border border-white/40 shadow-xl z-10 transition-all duration-300">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <ProgressBar value={stats.hunger} color="bg-orange-400" icon={<IconHunger />} label="Hunger" />
        <ProgressBar value={stats.energy} color="bg-blue-400" icon={<IconEnergy />} label="Energy" />
        <ProgressBar value={stats.happiness} color="bg-pink-400" icon={<IconHappy />} label="Happy" />
        <ProgressBar value={stats.hygiene} color="bg-cyan-400" icon={<IconClean />} label="Clean" />
      </div>
    </div>
  );
};

export default StatsBar;
