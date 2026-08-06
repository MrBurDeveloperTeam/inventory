import React, { useState, useEffect, useRef } from 'react';
import { PetRoom } from './PetRoom';
import { GamePage } from './components/GamePage';
import { GameStateProvider } from './context/GameStateContext';
import PetAdoptionModal from './components/PetAdoptionModal';
import { RoomType } from './types';
import { useGameState } from './hooks/useGameState';
import { supabase } from '../lib/supabaseClient';
import { TiArrowBack } from "react-icons/ti";

const LANDSCAPE_GAME_IDS = new Set<string>([
    'paccat',
    'tetris',
]);

const requiresLandscapeMode = (gameId: string | null) => {
    return gameId !== null && LANDSCAPE_GAME_IDS.has(gameId);
};

type LockableScreenOrientation = ScreenOrientation & {
    lock?: (orientation: 'landscape') => Promise<void>;
    unlock?: () => void;
};

type FullscreenHTMLElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitFullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
};

// Inner component to access context
const VirtualPetContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [view, setView] = useState<'ROOM' | 'GAME'>('ROOM');
    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const [showRotateNotice, setShowRotateNotice] = useState(false);
    const enteredFullscreenRef = useRef(false);
    const { setCurrentRoom } = useGameState();

    const enterLandscapeMode = async () => {
        const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
        const fullscreenTarget = document.documentElement as FullscreenHTMLElement;
        const fullscreenDocument = document as WebkitFullscreenDocument;

        try {
            if (!document.fullscreenElement && !fullscreenDocument.webkitFullscreenElement) {
                if (fullscreenTarget.requestFullscreen) {
                    await fullscreenTarget.requestFullscreen({ navigationUI: 'hide' });
                    enteredFullscreenRef.current = true;
                } else if (fullscreenTarget.webkitRequestFullscreen) {
                    await Promise.resolve(fullscreenTarget.webkitRequestFullscreen());
                    enteredFullscreenRef.current = true;
                }
            }
        } catch (error) {
            console.warn('[Landscape Game] Fullscreen mode is unavailable:', error);
        }

        try {
            if (orientation?.lock) {
                await orientation.lock('landscape');
            }
        } catch (error) {
            console.warn('[Landscape Game] Orientation lock is unavailable:', error);
        }
    };

    const releaseLandscapeMode = async () => {
        const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
        const fullscreenDocument = document as WebkitFullscreenDocument;

        try {
            orientation?.unlock?.();
        } catch (error) {
            console.warn('[Landscape Game] Could not unlock screen orientation:', error);
        }

        try {
            if (enteredFullscreenRef.current) {
                if (document.fullscreenElement && document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (
                    fullscreenDocument.webkitFullscreenElement &&
                    fullscreenDocument.webkitExitFullscreen
                ) {
                    await Promise.resolve(fullscreenDocument.webkitExitFullscreen());
                }
            }
        } catch (error) {
            console.warn('[Landscape Game] Could not exit fullscreen mode:', error);
        }

        enteredFullscreenRef.current = false;
    };

    const handleNavigateToGame = async (gameId: string) => {
        if (requiresLandscapeMode(gameId)) {
            await enterLandscapeMode();
        }

        setActiveGameId(gameId);
        setView('GAME');
    };

    const handleCloseGame = async () => {
        const shouldReleaseLandscape = requiresLandscapeMode(activeGameId);

        setActiveGameId(null);
        setView('ROOM');
        setCurrentRoom(RoomType.GAMES);
        setShowRotateNotice(false);

        if (shouldReleaseLandscape) {
            await releaseLandscapeMode();
        }
    };

    const handleCloseVirtualPet = async () => {
        if (requiresLandscapeMode(activeGameId)) {
            await releaseLandscapeMode();
        }

        setShowRotateNotice(false);
        onClose();
    };

    useEffect(() => {
        if (view !== 'GAME' || !requiresLandscapeMode(activeGameId)) {
            setShowRotateNotice(false);
            return;
        }

        const updateOrientationNotice = () => {
            setShowRotateNotice(window.innerHeight > window.innerWidth);
        };

        updateOrientationNotice();

        window.addEventListener('resize', updateOrientationNotice);
        window.screen.orientation?.addEventListener('change', updateOrientationNotice);

        return () => {
            window.removeEventListener('resize', updateOrientationNotice);
            window.screen.orientation?.removeEventListener('change', updateOrientationNotice);
        };
    }, [view, activeGameId]);

    return (
        <div className="relative h-full w-full overflow-hidden pet-interface">
            {view === 'ROOM' && (
                <button
                    type="button"
                    onClick={handleCloseVirtualPet}
                    className="absolute left-3 top-3 z-[70] flex h-11 w-11 items-center justify-center rounded-xl border border-white/60 bg-white/75 text-slate-700 shadow-xl shadow-slate-900/10 backdrop-blur-md transition-all hover:-translate-x-0.5 hover:scale-105 hover:bg-white active:scale-95 md:left-6 md:top-6 md:h-16 md:w-16 md:rounded-2xl"
                    title="Back"
                    aria-label="Back"
                >
                    <TiArrowBack className="h-8 w-8 md:h-12 md:w-12" strokeWidth={0} />
                </button>
            )}

            {view === 'ROOM' ? (
                <PetRoom onNavigateToGame={handleNavigateToGame} />
            ) : (
                <>
                    <GamePage
                        gameId={activeGameId || ''}
                        onClose={handleCloseGame}
                    />

                    {requiresLandscapeMode(activeGameId) && showRotateNotice && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 px-6 text-white">
                            <div className="max-w-sm text-center">
                                <div className="mb-4 text-6xl">📱↻</div>

                                <h2 className="text-xl font-bold">
                                    Rotate your device
                                </h2>

                                <p className="mt-2 text-sm text-white/75">
                                    {activeGameId === 'tetris' ? 'Tetris' : 'PAC-CAT'} is designed for landscape mode. Please rotate your phone to continue.
                                </p>

                                <button
                                    type="button"
                                    onClick={handleCloseGame}
                                    className="mt-6 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                                >
                                    Back to games
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            <PetAdoptionModal />
        </div>
    );
};

interface VirtualPetContainerProps {
    isOpen: boolean;
    onClose: () => void;
}

interface GeoInfo {
    ip: string;
    country_name: string;
    country_code: string;
    city: string;
    region: string;
    timezone: string;
    currency: string; // e.g. "MYR", "USD", "EUR"
}

const DEFAULT_CURRENCY_CODE = 'USD';

const normalizeCurrencyCode = (currency?: string | null) => {
    const normalized = (currency || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY_CODE;
};

const getSupportedPricingCurrency = async (currency?: string | null): Promise<string> => {
    const requestedCurrency = normalizeCurrencyCode(currency);
    if (requestedCurrency === DEFAULT_CURRENCY_CODE) return DEFAULT_CURRENCY_CODE;

    try {
        const { data, error } = await supabase
            .from('aiboard_pricing_currencies')
            .select('currency_code')
            .ilike('currency_code', requestedCurrency)
            .maybeSingle();

        if (!error && data?.currency_code) {
            return normalizeCurrencyCode(data.currency_code);
        }
    } catch (err) {
        console.warn('[Currency] Failed to verify pricing currency:', err);
    }

    console.warn(`[Currency] ${requestedCurrency} is not configured in aiboard_pricing_currencies. Using USD.`);
    return DEFAULT_CURRENCY_CODE;
};


// Detect IP/country and log the visit to Supabase
// Fallback chain: ipapi.co → last stored visit currency → 'USD'
async function detectAndLogVisit(): Promise<string> {
    // --- Attempt 1: Live geolocation ---
    try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
            const geo: GeoInfo = await res.json();

            const { data: sessionData } = await supabase.auth.getSession();
            const userId = sessionData?.session?.user?.id ?? null;

            if (userId) {
                const { error: visitError } = await supabase.from('virtual_pet_visits').upsert({
                    user_id: userId,
                    ip: geo.ip,
                    country: geo.country_name,
                    country_code: geo.country_code,
                    city: geo.city,
                    region: geo.region,
                    timezone: geo.timezone,
                    currency: normalizeCurrencyCode(geo.currency),
                    visited_at: new Date().toISOString(),
                }, { onConflict: 'user_id' });

                if (visitError) {
                    console.warn('[VirtualPet] Could not save visit location:', visitError.message);
                }
            }

            console.log(`[VirtualPet] Visit logged — ${geo.city}, ${geo.country_name} (${geo.currency})`);
            return getSupportedPricingCurrency(geo.currency);
        }
    } catch {
        console.warn('[VirtualPet] Geolocation failed, trying stored record...');
    }

    // --- Attempt 2: Use last known currency from Supabase ---
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id ?? null;

        if (userId) {
            const { data: lastVisit } = await supabase
                .from('virtual_pet_visits')
                .select('currency')
                .eq('user_id', userId)
                .not('currency', 'is', null)
                .order('visited_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (lastVisit?.currency) {
                console.log(`[VirtualPet] Using stored currency: ${lastVisit.currency}`);
                return getSupportedPricingCurrency(lastVisit.currency);
            }
        }
    } catch {
        console.warn('[VirtualPet] Could not fetch stored visit currency.');
    }

    // --- Fallback: USD ---
    return DEFAULT_CURRENCY_CODE;
}


export const VirtualPetContainer: React.FC<VirtualPetContainerProps> = ({ isOpen, onClose }) => {
    const hasLoggedRef = useRef(false);
    const [detectedCurrency, setDetectedCurrency] = useState(DEFAULT_CURRENCY_CODE);

    useEffect(() => {
        const root = document.documentElement;
        const previousBodyOverflow = document.body.style.overflow;
        const previousScrollbarGutter = root.style.scrollbarGutter;

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            root.style.scrollbarGutter = 'auto';

            if (!hasLoggedRef.current) {
                hasLoggedRef.current = true;

                detectAndLogVisit().then(currency => {
                    setDetectedCurrency(currency);
                });
            }
        } else {
            document.body.style.overflow = previousBodyOverflow;
            root.style.scrollbarGutter = previousScrollbarGutter;
            hasLoggedRef.current = false;
        }

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            root.style.scrollbarGutter = previousScrollbarGutter;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed left-0 top-0 z-[1000] h-dvh w-screen bg-black animate-in fade-in duration-200">
            <div className="relative h-full w-full">
                <GameStateProvider currencyCode={detectedCurrency}>
                    <VirtualPetContent onClose={onClose} />
                </GameStateProvider>
            </div>
        </div>
    );
};
