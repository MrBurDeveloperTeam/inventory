import React, { useEffect, useRef, useState } from 'react';
import { TiArrowBack } from 'react-icons/ti';
import { useGameState } from '../hooks/useGameState';

const GAME_CONFIG: Record<string, { title: string; url: string; icon: string; gradient: string }> = {
    flappy: {
        title: 'Flappy Cat',
        url: '/games/flappy-cat/index.html?v=20260731-12',
        icon: '🕊️',
        gradient: 'from-yellow-400 to-orange-500'
    },
    paccat: {
        title: 'Pac-Cat',
        url: '/games/pac-cat/index.html?v=20260807-2',
        icon: '👻',
        gradient: 'from-blue-400 to-indigo-600'
    },
    tetris: {
        title: 'Tetris',
        url: '/games/tetris/index.html?v=20260730-10',
        icon: '🧱',
        gradient: 'from-red-400 to-pink-600'
    }
};

/**
 * Animated number component for the "increase" effect
 */
const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
    const [displayValue, setDisplayValue] = useState(value);
    const frameRef = useRef<number>(0);
    const startValue = useRef(value);
    const endValue = useRef(value);
    const startTime = useRef(0);
    const duration = 3000; // 3 second animation

    useEffect(() => {
        if (value === displayValue) return;

        // Reset animation state
        startValue.current = displayValue;
        endValue.current = value;
        startTime.current = performance.now();

        const animate = (now: number) => {
            const elapsed = now - startTime.current;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easedProgress = 1 - Math.pow(1 - progress, 3);

            const current = Math.floor(startValue.current + (endValue.current - startValue.current) * easedProgress);
            setDisplayValue(current);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            }
        };

        frameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameRef.current);
    }, [value]);

    return <span>{String(displayValue)}</span>;
};

interface GamePageProps {
    gameId: string;
    onClose: () => void;
    onExitPet: () => void;
}

export const GamePage: React.FC<GamePageProps> = ({
    gameId,
    onClose,
    onExitPet
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const { stats, setStats } = useGameState();
    const [sessionCoins, setSessionCoins] = useState(0);

    // Sync score from games
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Update temporary display score
            if (event.data?.type === 'GAME_SCORE_UPDATE') {
                const totalScore = event.data.score || 0;
                setSessionCoins(Math.floor(totalScore / 100));
            }

            // Persistence: Only add to official total when game ends
            if (event.data?.type === 'GAME_OVER') {
                const totalScore = event.data.score || 0;
                const reward = Math.floor(totalScore / 100);

                if (reward > 0) {
                    setStats(prev => ({
                        ...prev,
                        coins: (prev.coins || 0) + reward,
                        happiness: Math.min(100, (prev.happiness || 0) + 15)
                    }));
                }
                setSessionCoins(0); // Clear pending
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [setStats]);

    // Prevent scroll when game is open
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;

        const previousHtmlOverflow = html.style.overflow;
        const previousHtmlOverscroll = html.style.overscrollBehavior;
        const previousBodyOverflow = body.style.overflow;
        const previousBodyOverscroll = body.style.overscrollBehavior;

        html.style.overflow = 'hidden';
        html.style.overscrollBehavior = 'none';
        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';

        return () => {
            html.style.overflow = previousHtmlOverflow;
            html.style.overscrollBehavior = previousHtmlOverscroll;
            body.style.overflow = previousBodyOverflow;
            body.style.overscrollBehavior = previousBodyOverscroll;
        };
    }, []);

    if (!gameId || !GAME_CONFIG[gameId]) {
        onClose();
        return null;
    }

    const config = GAME_CONFIG[gameId];

    return (
        <div
            className="fixed inset-0 z-50 h-[100dvh] w-[100dvw] overflow-hidden bg-[#071225]"
            style={{ fontFamily: "'Fredoka', sans-serif" }}
        >
            <div className="relative h-full w-full overflow-hidden animate-in zoom-in-95 fade-in duration-300">
                {/* Back to Main App */}
                <button
                    type="button"
                    onClick={onExitPet}
                    className="absolute z-[60] flex h-11 w-11 items-center justify-center rounded-xl border border-white/60 bg-white/80 text-slate-700 shadow-xl shadow-black/20 backdrop-blur-md transition-all hover:-translate-x-0.5 hover:scale-105 hover:bg-white active:scale-95 sm:h-12 sm:w-12"
                    style={{
                        top: 'max(0.75rem, env(safe-area-inset-top, 0px))',
                        left: 'max(0.75rem, env(safe-area-inset-left, 0px))',
                    }}
                    title="Back to Inventory"
                    aria-label="Back to Inventory"
                >
                    <TiArrowBack
                        className="h-8 w-8 sm:h-9 sm:w-9"
                        strokeWidth={0}
                    />
                </button>

                {/* Top UI Area */}
                <div
                    className="pointer-events-none absolute z-[60] flex flex-col items-end gap-2"
                    style={{
                        top: 'max(0.75rem, env(safe-area-inset-top, 0px))',
                        right: 'max(0.75rem, env(safe-area-inset-right, 0px))',
                    }}
                >
                    <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                        {sessionCoins > 0 && (
                            <div className="flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1.5 text-yellow-400 shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 sm:gap-1.5 sm:px-3">
                                <span className="hidden text-[10px] font-black uppercase tracking-wider opacity-70 sm:inline">
                                    Coins
                                </span>

                                <span className="text-xs font-black tracking-widest sm:text-sm">
                                    +{sessionCoins}
                                </span>
                            </div>
                        )}

                        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-white shadow-lg ring-1 ring-white/5 backdrop-blur-md transition-all duration-500 sm:gap-2 sm:px-4 sm:py-2.5">
                            <span className="text-sm sm:text-xl">💰</span>

                            <span className="min-w-[3ch] text-right text-xs font-black tracking-widest sm:text-lg">
                                <AnimatedCounter value={stats.coins || 0} />
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/10 bg-black/40 text-white/70 shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-black/80 hover:text-white active:scale-95 sm:h-12 sm:w-12"
                            title="Exit Game"
                            aria-label="Exit game"
                        >
                            <span className="mb-0.5 text-lg font-bold leading-none sm:mb-1 sm:text-2xl">
                                ×
                            </span>
                        </button>
                    </div>
                </div>

                {/* Game Iframe Wrapper */}
                <div className="absolute inset-0 overflow-hidden bg-[#071225]">
                    {isLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900">
                            <div className="flex flex-col items-center gap-4">
                                <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white" />

                                <span className="text-sm text-white/60">
                                    Loading {config.title}...
                                </span>
                            </div>
                        </div>
                    )}

                    <iframe
                        src={config.url}
                        className="block h-full w-full overflow-hidden border-0"
                        title={config.title}
                        onLoad={() => setIsLoading(false)}
                        allow="autoplay; fullscreen; screen-wake-lock"
                        allowFullScreen
                        scrolling="no"
                    />
                </div>
            </div>
        </div>
    );
};
