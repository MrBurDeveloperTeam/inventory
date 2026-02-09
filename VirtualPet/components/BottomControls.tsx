
import React from 'react';
import { RoomType } from '../types';

interface BottomControlsProps {
    currentRoom: RoomType;
    isSleeping: boolean;
    onNavigate: (room: RoomType) => void;
    onToggleSleep: () => void;
    onToggleFoodMenu: () => void;
    onToggleBathroomMenu: () => void;
    showFoodMenu: boolean;
    showBathroomMenu: boolean;
}

const IconKitchen = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);

const IconBathroom = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-1L2 2l.5 3.5a1.5 1.5 0 0 0 1 1L6 9" />
    <path d="M9 6h11a2 2 0 0 1 2 2v10.5a.5.5 0 0 1-.5.5h-19a.5.5 0 0 1-.5-.5V8a2 2 0 0 1 2-2h3" />
  </svg>
);

const IconPlayground = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="6" y1="12" x2="10" y2="12" />
    <line x1="8" y1="10" x2="8" y2="14" />
    <line x1="15" y1="13" x2="15.01" y2="13" />
    <line x1="18" y1="11" x2="18.01" y2="11" />
    <rect x="2" y="6" width="20" height="12" rx="2" />
  </svg>
);

const IconBedroom = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 4v16" />
    <path d="M2 8h18a2 2 0 0 1 2 2v10" />
    <path d="M2 17h20" />
    <path d="M6 8v9" />
  </svg>
);

const IconGames = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <path d="M2 12c0 5.5 4.5 10 10 10s10-4.5 10-10S17.5 2 12 2 2 6.5 2 12z" />
      <circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" className="opacity-80" />
      <circle cx="14.5" cy="14.5" r="1.5" fill="currentColor" className="opacity-80" />
    </svg>
  );

const BottomControls: React.FC<BottomControlsProps> = ({ 
    currentRoom, isSleeping, 
    onNavigate, onToggleSleep,
    onToggleFoodMenu, onToggleBathroomMenu,
    showFoodMenu, showBathroomMenu
}) => {
    
    // Updated styling for sidebar layout
    const getButtonStyle = (isActive: boolean) => 
        `relative group flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-300 cursor-pointer ${
            isActive 
            ? 'bg-white shadow-lg scale-105 z-10' 
            : 'bg-white/20 hover:bg-white/30 hover:scale-105'
        }`;
    
    const getIconClass = (isActive: boolean, color: string) => 
        `w-7 h-7 mb-1 transition-colors duration-300 ${isActive ? color : 'text-white'}`;

    const getLabelClass = (isActive: boolean, color: string) =>
        `text-[9px] font-bold uppercase tracking-wider transition-colors duration-300 ${isActive ? color : 'text-white/80'}`;

    const handleFeedClick = () => {
        if (currentRoom !== RoomType.KITCHEN) {
            onNavigate(RoomType.KITCHEN);
            // Automatically open the menu when navigating to Kitchen
            if (!showFoodMenu) {
                onToggleFoodMenu();
            }
        } else {
            onToggleFoodMenu();
        }
    };

    const handleCleanClick = () => {
        if (currentRoom !== RoomType.BATHROOM) {
            onNavigate(RoomType.BATHROOM);
            // Automatically open the menu when navigating to Bathroom
            if (!showBathroomMenu) {
                onToggleBathroomMenu();
            }
        } else {
            onToggleBathroomMenu();
        }
    };

    const handlePlayClick = () => {
        if (currentRoom !== RoomType.PLAYROOM) {
            onNavigate(RoomType.PLAYROOM);
        }
    };

    const handleSleepClick = () => {
        if (currentRoom !== RoomType.BEDROOM) {
            onNavigate(RoomType.BEDROOM);
        } else {
            onToggleSleep();
        }
    };

    const handleGamesClick = () => {
        if (currentRoom !== RoomType.GAMES) {
            onNavigate(RoomType.GAMES);
        }
    };

    return (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40">
            <div className="flex flex-col gap-3 p-3 bg-black/20 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl scale-95 origin-left">
                
                <button 
                  onClick={handleFeedClick}
                  className={getButtonStyle(currentRoom === RoomType.KITCHEN)}
                  title="Kitchen"
                >
                   <IconKitchen className={getIconClass(currentRoom === RoomType.KITCHEN, 'text-orange-500')} />
                   <span className={getLabelClass(currentRoom === RoomType.KITCHEN, 'text-orange-500')}>Kitchen</span>
                </button>

                <button 
                  onClick={handleCleanClick}
                  className={getButtonStyle(currentRoom === RoomType.BATHROOM)}
                  title="Bathroom"
                >
                   <IconBathroom className={getIconClass(currentRoom === RoomType.BATHROOM, 'text-cyan-500')} />
                   <span className={getLabelClass(currentRoom === RoomType.BATHROOM, 'text-cyan-500')}>Bathroom</span>
                </button>

                <button 
                  onClick={handlePlayClick}
                  className={getButtonStyle(currentRoom === RoomType.PLAYROOM)}
                  title="Playground"
                >
                   <IconPlayground className={getIconClass(currentRoom === RoomType.PLAYROOM, 'text-pink-500')} />
                   <span className={getLabelClass(currentRoom === RoomType.PLAYROOM, 'text-pink-500')}>Outside</span>
                </button>

                <button 
                  onClick={handleSleepClick}
                  className={getButtonStyle(currentRoom === RoomType.BEDROOM)}
                  title="Bedroom"
                >
                   <IconBedroom className={getIconClass(currentRoom === RoomType.BEDROOM, 'text-indigo-500')} />
                   <span className={getLabelClass(currentRoom === RoomType.BEDROOM, 'text-indigo-500')}>Bedroom</span>
                </button>

                <button 
                  onClick={handleGamesClick}
                  className={getButtonStyle(currentRoom === RoomType.GAMES)}
                  title="Games"
                >
                   <IconGames className={getIconClass(currentRoom === RoomType.GAMES, 'text-violet-500')} />
                   <span className={getLabelClass(currentRoom === RoomType.GAMES, 'text-violet-500')}>Games</span>
                </button>
                
            </div>
        </div>
    );
};

export default BottomControls;