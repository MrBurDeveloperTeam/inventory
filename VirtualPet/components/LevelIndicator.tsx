
import React, { useState } from 'react';
import { PetStats, PetColor } from '../types';
import { COLORS } from '../constants';

interface LevelIndicatorProps {
  stats: PetStats;
  onColorChange: (color: PetColor) => void;
}

const LevelIndicator: React.FC<LevelIndicatorProps> = ({ stats, onColorChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  // The main body shape
  const bodyPath = "M 40 30 Q 70 70 100 65 Q 130 70 160 30 Q 190 80 180 150 Q 170 195 100 190 Q 30 195 20 150 Q 10 80 40 30 Z";

  // Whiskers
  const whiskersPath = `
    M 45 115 L 5 105
    M 45 135 L 5 145
    M 155 115 L 195 105
    M 155 135 L 195 145
  `;
  
  // Calculate fill position based on shape bounds
  // Shape top is roughly y=30, bottom is roughly y=195.
  // Height range is 165px.
  // 0% XP should be at y=195.
  // 100% XP should be at y=30.
  const fillHeightRange = 165;
  const fillBottomY = 195;
  const xpPercent = Math.min(100, Math.max(0, stats.xp)) / 100;
  const fillY = fillBottomY - (xpPercent * fillHeightRange);

  return (
    <div className="absolute top-3 right-6 z-40 flex flex-col items-end animate-in fade-in slide-in-from-right-4 duration-700">
        <button 
            onClick={() => setIsOpen(!isOpen)}
            className="relative w-20 h-20 shrink-0 group transition-transform hover:scale-105 active:scale-95 duration-200 outline-none cursor-pointer" 
            title={`Level ${stats.level}`}
        >
            <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible drop-shadow-xl">
                <defs>
                    <clipPath id="body-mask-lvl">
                        <path d={bodyPath} />
                    </clipPath>
                    <linearGradient id="fill-gradient-lvl" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#fbbf24" /> {/* amber-400 */}
                          <stop offset="100%" stopColor="#f59e0b" /> {/* amber-500 */}
                    </linearGradient>
                </defs>

                {/* Base Background (Glassy) with white border */}
                <path d={bodyPath} className="fill-white/30 backdrop-blur-md stroke-white/60 stroke-[4]" />

                {/* Progress Fill - Masked by Shape */}
                <g clipPath="url(#body-mask-lvl)">
                    <rect
                        x="0"
                        y={fillY}
                        width="200"
                        height="200"
                        fill="url(#fill-gradient-lvl)"
                        className="transition-all duration-700 ease-out"
                    />
                </g>

                {/* Existing faint Outline Ring */}
                <path d={bodyPath} className="fill-none stroke-slate-500/10 stroke-[4px]" />

                {/* Black Outline */}
                <path d={bodyPath} className="fill-none stroke-black stroke-[4px] pointer-events-none" />

                {/* Whiskers */}
                <path
                  d={whiskersPath}
                  className="fill-none stroke-slate-600/60 stroke-[3px]"
                  strokeLinecap="round"
                />

                {/* Level Number */}
                <text
                    x="100"
                    y="110"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="text-5xl font-black fill-slate-800 drop-shadow-sm pointer-events-none select-none"
                    style={{ fontFamily: 'Fredoka, sans-serif' }}
                >
                    {stats.level}
                </text>

                {/* 'LVL' Label */}
                <text
                    x="100"
                    y="150"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="text-[18px] font-bold fill-slate-700/70 tracking-widest pointer-events-none select-none"
                    style={{ fontFamily: 'Fredoka, sans-serif' }}
                >
                    LVL
                </text>
            </svg>
        </button>

        {/* Popover Menu */}
        {isOpen && (
            <div className="absolute top-24 right-0 bg-white/90 backdrop-blur-xl rounded-2xl p-5 shadow-2xl w-64 border border-white/50 animate-in fade-in zoom-in-95 origin-top-right">
                <div className="text-center mb-4">
                    <h3 className="text-xl font-bold text-slate-800">Level {stats.level}</h3>
                    <div className="text-sm font-semibold text-slate-500 mt-1">
                        {Math.floor(stats.xp)} / 100 XP
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-3 bg-slate-200 rounded-full mt-2 overflow-hidden shadow-inner">
                        <div 
                            className="h-full bg-amber-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, stats.xp))}%` }}
                        />
                    </div>
                </div>

                <div className="border-t border-slate-200 pt-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 text-center">Pet Color</p>
                    <div className="grid grid-cols-3 gap-3">
                         {COLORS.map((c) => (
                             <button
                               key={c.value}
                               className="w-10 h-10 rounded-full border-2 border-white shadow-md hover:scale-110 active:scale-95 transition-all mx-auto"
                               style={{ backgroundColor: c.value }}
                               onClick={() => onColorChange(c.value)}
                               title={c.label}
                             />
                           ))}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default LevelIndicator;
