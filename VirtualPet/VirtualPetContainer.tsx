import React, { useState } from 'react';
import { FcHome } from "react-icons/fc";
import { PetRoom } from './PetRoom';
import { GamePage } from './components/GamePage';
import { GameStateProvider } from './context/GameStateContext';
import { RoomType } from './types';
import { useGameState } from './hooks/useGameState';

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
                className="absolute top-5 left-5 z-[100] w-20 h-20 flex items-center justify-center text-slate-800/80 hover:scale-110 transition-all drop-shadow-lg"
                title="Back to Inventory"
            >
                <FcHome size={80} />
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

export const VirtualPetContainer: React.FC<VirtualPetContainerProps> = ({ isOpen, onClose }) => {
    React.useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] bg-black animate-in fade-in duration-200">
            <div className="w-full h-full relative">
                <GameStateProvider>
                    <VirtualPetContent onClose={onClose} />
                </GameStateProvider>
            </div>
        </div>
    );
};
