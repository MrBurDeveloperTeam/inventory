import React, { useEffect, useState, useRef } from 'react';
import { useGameState } from '../hooks/useGameState';
import { TiArrowBack } from 'react-icons/ti';
import { supabase } from '../../supabaseClient';

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
    },
    meowdoku: {
        title: 'Meowdoku',
        // Version the iframe document itself. Mobile browsers can otherwise keep
        // an older Meowdoku HTML shell (and therefore an older game.js URL) even
        // after the main application has been updated.
        url: '/games/meowdoku/index.html?v=20260817-color-contrast-v1',
        icon: '🐱',
        gradient: 'from-fuchsia-400 to-violet-600'
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
    onExitPet?: () => void;
}

export const GamePage: React.FC<GamePageProps> = ({
    gameId,
    onClose,
    onExitPet = onClose,
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [isPortrait, setIsPortrait] = useState(false);
    const { stats, setStats } = useGameState();
    const [sessionCoins, setSessionCoins] = useState(0);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const meowdokuUserIdRef = useRef<string | null>(null);

    const sendMeowdokuProgress = (progress: { unlocked_level: number; completed_modes: Record<string, unknown> }) => {
        iframeRef.current?.contentWindow?.postMessage({
            type: 'MEOWDOKU_PROGRESS',
            progress
        }, window.location.origin);
    };

    const sendUnlockedAchievements = (value: unknown) => {
        const achievements = Array.isArray(value) ? value : [];
        if (!achievements.length) return;
        iframeRef.current?.contentWindow?.postMessage({
            type: 'MEOWDOKU_ACHIEVEMENTS_UNLOCKED',
            achievements
        }, window.location.origin);
    };

    const loadMeowdokuAchievements = async () => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_get_achievements');
        iframeRef.current?.contentWindow?.postMessage(error
            ? { type: 'MEOWDOKU_ACHIEVEMENTS_ERROR', message: error.message }
            : { type: 'MEOWDOKU_ACHIEVEMENTS', achievements: data }, window.location.origin);
    };

    const loadMeowdokuProgress = async () => {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            meowdokuUserIdRef.current = null;
            iframeRef.current?.contentWindow?.postMessage({ type: 'MEOWDOKU_PROGRESS_LOCAL_ONLY' }, window.location.origin);
            return false;
        }

        meowdokuUserIdRef.current = user.id;
        const { data, error } = await supabase.rpc('meowdoku_get_mode_progress');

        if (error) {
            console.error('Unable to load Meowdoku progress:', error);
            iframeRef.current?.contentWindow?.postMessage({ type: 'MEOWDOKU_PROGRESS_LOCAL_ONLY' }, window.location.origin);
            return true;
        }

        const progress = Array.isArray(data) ? data[0] : data;
        sendMeowdokuProgress({
            unlocked_level: Math.max(1, Math.min(60, Number(progress?.unlocked_level) || 1)),
            completed_modes: progress?.completed_modes && typeof progress.completed_modes === 'object'
                ? progress.completed_modes as Record<string, unknown>
                : {}
        });
        return true;
    };

    const initializeMeowdoku = async () => {
        const hasAuthenticatedUser = await loadMeowdokuProgress();
        if (!hasAuthenticatedUser) return;
        await Promise.all([
            loadMeowdokuCheckIn(),
            loadMeowdokuAchievements()
        ]);
    };

    const saveMeowdokuProgress = async (payload: { completed_level?: unknown; mode?: unknown; score?: unknown; mistakes?: unknown; time_seconds?: unknown; hints_used?: unknown; lives_remaining?: unknown }) => {
        const userId = meowdokuUserIdRef.current;
        if (!userId) return;

        const completedLevel = Math.max(1, Math.min(60, Math.floor(Number(payload.completed_level) || 0)));
        if (!completedLevel) return;
        const mode = String(payload.mode || '').toLowerCase();
        if (!['easy', 'medium', 'hard', 'hell'].includes(mode)) return;
        const { data, error } = await supabase.rpc('meowdoku_complete_mode_with_achievements', {
            p_level_number: completedLevel,
            p_mode: mode,
            p_score: Math.max(0, Math.floor(Number(payload.score) || 0)),
            p_mistakes: Math.max(0, Math.floor(Number(payload.mistakes) || 0)),
            p_time_seconds: Math.max(0, Math.floor(Number(payload.time_seconds) || 0)),
            p_hints_used: Math.max(0, Math.floor(Number(payload.hints_used) || 0)),
            p_lives_remaining: Math.max(1, Math.min(3, Math.floor(Number(payload.lives_remaining) || 3)))
        });

        if (error) {
            console.error('Unable to save Meowdoku progress:', error);
            return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        sendUnlockedAchievements(result?.new_achievements);
        await loadMeowdokuProgress();
        await loadMeowdokuAchievements();
    };

    const recordMeowdokuCatFound = async (payload: { level?: unknown; cat_index?: unknown }) => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_record_cat_found', {
            p_level_number: Math.max(1, Math.min(60, Math.floor(Number(payload.level) || 1))),
            p_cat_index: Math.max(0, Math.floor(Number(payload.cat_index) || 0))
        });
        if (error) {
            console.error('Unable to save Meowdoku cat discovery:', error);
            return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        sendUnlockedAchievements(result?.new_achievements);
        await loadMeowdokuAchievements();
    };

    const loadMeowdokuCheckIn = async () => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_get_check_in');
        iframeRef.current?.contentWindow?.postMessage(error
            ? { type: 'MEOWDOKU_CHECK_IN_ERROR', message: error.message }
            : { type: 'MEOWDOKU_CHECK_IN', checkIn: data }, window.location.origin);
    };

    const claimMeowdokuCheckIn = async () => {
        if (!meowdokuUserIdRef.current) return;
        const { data, error } = await supabase.rpc('meowdoku_claim_check_in');
        if (error) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'MEOWDOKU_CHECK_IN_ERROR', message: error.message }, window.location.origin);
            return;
        }
        const result = Array.isArray(data) ? data[0] : data;
        if (result?.coins != null) setStats(prev => ({ ...prev, coins: Number(result.coins) || prev.coins || 0 }));
        iframeRef.current?.contentWindow?.postMessage({ type: 'MEOWDOKU_CHECK_IN_CLAIMED', checkIn: result }, window.location.origin);
        sendUnlockedAchievements(result?.new_achievements);
        await loadMeowdokuAchievements();
    };

    // Sync score from games
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;

            if (event.data?.type === 'MEOWDOKU_READY') {
                iframeRef.current?.contentWindow?.postMessage({
                    type: 'MEOWDOKU_WALLET',
                    coins: stats.coins || 0
                }, window.location.origin);
                void initializeMeowdoku();
            }

            if (event.data?.type === 'MEOWDOKU_SAVE_PROGRESS') {
                void saveMeowdokuProgress(event.data.progress || {});
            }

            if (event.data?.type === 'MEOWDOKU_CAT_FOUND') {
                void recordMeowdokuCatFound(event.data || {});
            }

            if (event.data?.type === 'MEOWDOKU_GET_CHECK_IN') void loadMeowdokuCheckIn();
            if (event.data?.type === 'MEOWDOKU_CLAIM_CHECK_IN') void claimMeowdokuCheckIn();
            if (event.data?.type === 'MEOWDOKU_GET_ACHIEVEMENTS') void loadMeowdokuAchievements();

            if (event.data?.type === 'MEOWDOKU_SPEND_COINS') {
                const amount = Math.max(0, Math.floor(Number(event.data.amount) || 0));
                const requestId = String(event.data.requestId || '');
                if (amount > 0 && (stats.coins || 0) >= amount) {
                    setStats(prev => ({ ...prev, coins: Math.max(0, (prev.coins || 0) - amount) }));
                    iframeRef.current?.contentWindow?.postMessage({ type: 'MEOWDOKU_SPEND_RESULT', requestId, ok: true }, window.location.origin);
                } else {
                    iframeRef.current?.contentWindow?.postMessage({ type: 'MEOWDOKU_SPEND_RESULT', requestId, ok: false }, window.location.origin);
                }
            }

            if (event.data?.type === 'MEOWDOKU_REWARD') {
                const reward = Math.max(0, Math.min(1000, Math.floor(Number(event.data.coins) || 0)));
                if (reward > 0) {
                    setStats(prev => ({
                        ...prev,
                        coins: (prev.coins || 0) + reward,
                        happiness: Math.min(100, (prev.happiness || 0) + 15)
                    }));
                }
            }
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
    }, [setStats, stats.coins]);

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

    // Pac-Cat and Tetris need a landscape play area. Chromium/Android can
    // lock the real screen orientation; iOS Safari cannot, so portrait iPhones
    // use the rotated viewport below as a visual fallback.
    const requiresLandscape = gameId === 'paccat' || gameId === 'tetris';

    useEffect(() => {
        if (!requiresLandscape) {
            setIsPortrait(false);
            return;
        }

        const updateOrientation = () => {
            setIsPortrait(window.innerHeight > window.innerWidth);
        };

        updateOrientation();
        window.addEventListener('resize', updateOrientation);
        window.addEventListener('orientationchange', updateOrientation);

        const orientation = screen.orientation as ScreenOrientation & {
            lock?: (orientation: 'landscape') => Promise<void>;
            unlock?: () => void;
        };

        orientation?.lock?.('landscape').catch(() => {
            // Expected on iOS Safari and when fullscreen is not active.
            // The CSS rotation fallback handles those browsers.
        });

        return () => {
            window.removeEventListener('resize', updateOrientation);
            window.removeEventListener('orientationchange', updateOrientation);
            orientation?.unlock?.();
        };
    }, [requiresLandscape]);

    if (!gameId || !GAME_CONFIG[gameId]) {
        onClose();
        return null;
    }

    const config = GAME_CONFIG[gameId];
    const isMeowdoku = gameId === 'meowdoku';

    return (
        <div className={`fixed inset-0 z-50 overflow-hidden ${isMeowdoku ? 'bg-[#f3f6ff]' : 'bg-black'}`} style={{ fontFamily: "'Fredoka', sans-serif" }}>
            {/* Container - Full Screen */}
            <div className="relative w-full h-full animate-in zoom-in-95 fade-in duration-300">

                {/* Meowdoku reserves this row only on narrow screens where floating controls would overlap its content. */}
                <div
                    className={`absolute inset-x-0 top-0 z-[60] flex items-center justify-between gap-2 px-3 sm:px-6 ${
                        isMeowdoku
                            ? 'h-0 border-0 bg-transparent p-0 shadow-none outline-none'
                            : 'pointer-events-none px-6'
                    }`}
                    style={isMeowdoku ? undefined : {
                        height: 'calc(112px + env(safe-area-inset-top))',
                        paddingTop: 'env(safe-area-inset-top)'
                    }}
                >
                    <button
                        type="button"
                        onClick={onExitPet}
                        className={`
                        pointer-events-auto
                        flex
                        shrink-0
                        appearance-none
                        items-center justify-center
                        ${isMeowdoku
                            ? 'absolute left-3 top-[calc(10px+env(safe-area-inset-top))] h-12 w-12 rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl md:left-6 md:top-[calc(24px+env(safe-area-inset-top))]'
                            : 'h-16 w-16 rounded-2xl'}
                        border border-white/60
                        bg-white/90
                        p-0
                        text-black
                        ${isMeowdoku ? 'shadow-none md:shadow-xl md:shadow-slate-900/10' : 'shadow-xl shadow-slate-900/10'}
                        backdrop-blur-md
                        transition-all
                        hover:-translate-x-0.5
                        hover:scale-105
                        hover:bg-white
                        active:scale-95
                        `}
                        title="Back to main page"
                        aria-label="Back to main page"
                    >
                        <TiArrowBack
                            className={isMeowdoku
                                ? 'h-9 w-9 text-black sm:h-11 sm:w-11'
                                : 'h-12 w-12 text-black'}
                            strokeWidth={0}
                        />
                    </button>

                    {/* Wallet and close control share the same fixed row. */}
                    <div className={`pointer-events-auto flex min-w-0 items-center ${isMeowdoku ? 'absolute right-3 top-[calc(12px+env(safe-area-inset-top))] gap-2 sm:gap-3 md:right-6 md:top-[calc(24px+env(safe-area-inset-top))]' : 'gap-3'}`}>
                        {sessionCoins > 0 && (
                            <div className={`${isMeowdoku ? 'hidden sm:flex' : 'flex'} items-center gap-1.5 bg-yellow-500/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-yellow-500/20 shadow-sm text-yellow-500 animate-in fade-in slide-in-from-top-2 duration-300`}>
                                <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Coins</span>
                                <span className="font-black text-sm tracking-widest">+{sessionCoins}</span>
                            </div>
                        )}

                        <div className={`flex items-center rounded-full backdrop-blur-md transition-all duration-500 ${isMeowdoku ? 'h-11 gap-1.5 border border-slate-200/80 bg-white/80 px-3 text-black shadow-none sm:h-12 sm:gap-2 sm:px-4 md:border-white/20 md:bg-black/40 md:text-white md:shadow-lg md:ring-1 md:ring-white/5' : 'gap-2 border border-white/20 bg-black/40 px-4 py-2.5 text-white shadow-lg ring-1 ring-white/5'}`}>
                            <span className="text-base sm:text-xl">💰</span>
                            <span className={`min-w-[3ch] text-right font-black tracking-wider ${isMeowdoku ? 'text-sm sm:text-lg' : 'text-lg'}`}>
                                <AnimatedCounter value={stats.coins || 0} />
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className={`flex shrink-0 appearance-none items-center justify-center rounded-full p-0 backdrop-blur-md transition-all hover:scale-105 active:scale-95 ${isMeowdoku ? 'h-11 w-11 border border-slate-200/80 bg-white/80 text-black shadow-none hover:bg-white sm:h-12 sm:w-12 md:border-white/10 md:bg-black/40 md:text-white md:shadow-lg md:hover:bg-black/60' : 'h-14 w-14 border border-white/10 bg-black/40 text-white shadow-lg hover:bg-black/60'}`}
                            title="Back to cat"
                            aria-label="Back to cat"
                        >
                            <span className={`${isMeowdoku ? 'text-2xl sm:text-3xl' : 'text-3xl'} font-black leading-none`}>×</span>
                        </button>
                    </div>
                </div>

                {/* Landscape orientation notice */}
                {requiresLandscape && isPortrait && (
                <div className="absolute inset-0 z-[55] flex items-center justify-center bg-slate-950/95 px-8 text-white backdrop-blur-md">
                    <div className="flex max-w-sm flex-col items-center text-center">
                    <div className="mb-5 rotate-90 animate-pulse text-7xl">
                        📱
                    </div>

                    <h2 className="text-2xl font-black">
                        Rotate your device
                    </h2>

                    <p className="mt-3 text-sm leading-6 text-white/70">
                        {config.title} requires landscape mode to play.
                    </p>
                    </div>
                </div>
                )}

                {/* Game Iframe Wrapper */}
                <div
                    className="absolute inset-x-0 bottom-0 top-0 border-0 bg-slate-900 shadow-none outline-none"
                >
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
                        ref={iframeRef}
                        src={config.url}
                        className="block h-full w-full border-0 shadow-none outline-none"
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


