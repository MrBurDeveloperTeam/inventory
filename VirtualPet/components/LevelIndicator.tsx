import React, { useState } from 'react';
import { PetStats } from '../types';

interface LevelIndicatorProps {
  stats: PetStats;
}

const LevelIndicator: React.FC<LevelIndicatorProps> = ({ stats }) => {
  const [isOpen, setIsOpen] = useState(false);

  const bodyPath = "M 40 30 Q 70 70 100 65 Q 130 70 160 30 Q 190 80 180 150 Q 170 195 100 190 Q 30 195 20 150 Q 10 80 40 30 Z";

  const whiskersPath = `
    M 45 115 L 5 105
    M 45 135 L 5 145
    M 155 115 L 195 105
    M 155 135 L 195 145
  `;

  const fillHeightRange = 165;
  const fillBottomY = 195;
  const xpPercent = Math.min(100, Math.max(0, stats.xp)) / 100;
  const fillY = fillBottomY - (xpPercent * fillHeightRange);

  return (
    <div className="absolute right-2 top-2 z-50 flex flex-col items-end animate-in fade-in slide-in-from-right-4 duration-700 md:right-6 md:top-3">
        <button
            onClick={() => setIsOpen(!isOpen)}
            className="group relative h-12 w-12 shrink-0 cursor-pointer outline-none transition-transform duration-200 hover:scale-105 active:scale-95 md:h-20 md:w-20"
            title={`Level ${stats.level}`}
        >
            <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible drop-shadow-xl">
                <defs>
                    <clipPath id="body-mask-lvl">
                        <path d={bodyPath} />
                    </clipPath>
                    <linearGradient id="fill-gradient-lvl" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#fbbf24" />
                          <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                </defs>

                <path d={bodyPath} className="fill-white/30 backdrop-blur-md stroke-white/60 stroke-[4]" />

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

                <path d={bodyPath} className="fill-none stroke-slate-500/10 stroke-[4px]" />
                <path d={bodyPath} className="fill-none stroke-black stroke-[4px] pointer-events-none" />
                <path
                  d={whiskersPath}
                  className="fill-none stroke-slate-600/60 stroke-[3px]"
                  strokeLinecap="round"
                />

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

        {isOpen && (
            <div className="absolute right-0 top-14 w-64 max-w-[90vw] origin-top-right animate-in rounded-2xl border border-white/50 bg-white/90 p-5 shadow-2xl backdrop-blur-xl fade-in zoom-in-95 md:top-24">
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">Level {stats.level}</h3>
                    <div className="text-sm font-semibold text-slate-500 mt-1">
                        {Math.floor(stats.xp)} / 100 XP
                    </div>
                    <div className="w-full h-3 bg-slate-200 rounded-full mt-2 overflow-hidden shadow-inner">
                        <div
                            className="h-full bg-amber-400 transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, stats.xp))}%` }}
                        />
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default LevelIndicator;
