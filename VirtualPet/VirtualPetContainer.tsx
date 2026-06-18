import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PetRoom } from './PetRoom';
import { GamePage } from './components/GamePage';
import { GameStateProvider } from './context/GameStateContext';
import { RoomType } from './types';
import { useGameState } from './hooks/useGameState';
import { supabase } from '../lib/supabaseClient';
import { TiArrowBackOutline } from "react-icons/ti";
import { TiArrowBack } from "react-icons/ti";

// Inner component to access context
const VirtualPetContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [view, setView] = useState<'ROOM' | 'GAME'>('ROOM');
    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const { setCurrentRoom } = useGameState();

    const handleNavigateToGame = (gameId: string) => {
        setActiveGameId(gameId);
        setView('GAME');
    };

    const handleCloseGame = () => {
        setActiveGameId(null);
        setView('ROOM');
        setCurrentRoom(RoomType.GAMES);
    };

    return (
        <div className="relative w-full h-full overflow-hidden pet-interface">
            {/* Close Overlay Button (Global) */}
            <button
                onClick={onClose}
                className="absolute left-6 top-6 z-50 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/60 bg-white/75 text-slate-700 shadow-xl shadow-slate-900/10 backdrop-blur-md transition-all hover:-translate-x-0.5 hover:scale-105 hover:bg-white active:scale-95"
                title="Back"
                aria-label="Back"
            >
                <TiArrowBack className="h-12 w-12" strokeWidth={0} />
            </button>

            {view === 'ROOM' ? (
                <PetRoom onNavigateToGame={handleNavigateToGame} />
            ) : (
                <GamePage
                    gameId={activeGameId || ''}
                    onClose={handleCloseGame}
                />
            )}
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

            await supabase.from('virtual_pet_visits').upsert({
                user_id: userId,
                ip: geo.ip,
                country: geo.country_name,
                country_code: geo.country_code,
                city: geo.city,
                region: geo.region,
                timezone: geo.timezone,
                currency: geo.currency,
                visited_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

            console.log(`[VirtualPet] Visit logged — ${geo.city}, ${geo.country_name} (${geo.currency})`);
            return geo.currency || 'USD';
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
                return lastVisit.currency;
            }
        }
    } catch {
        console.warn('[VirtualPet] Could not fetch stored visit currency.');
    }

    // --- Fallback: USD ---
    return 'USD';
}


export const VirtualPetContainer: React.FC<VirtualPetContainerProps> = ({ isOpen, onClose }) => {
    const hasLoggedRef = useRef(false);
    const [detectedCurrency, setDetectedCurrency] = useState('USD');

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // Detect geo only once per open session
            if (!hasLoggedRef.current) {
                hasLoggedRef.current = true;
                detectAndLogVisit().then(currency => {
                    setDetectedCurrency(currency);
                });
            }
        } else {
            document.body.style.overflow = 'auto';
            hasLoggedRef.current = false; // Reset so next open logs again
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] bg-black animate-in fade-in duration-200">
            <div className="w-full h-full relative">
                <GameStateProvider currencyCode={detectedCurrency}>
                    <VirtualPetContent onClose={onClose} />
                </GameStateProvider>
            </div>
        </div>
    );
};
