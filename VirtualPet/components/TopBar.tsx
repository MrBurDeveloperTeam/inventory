import React from 'react';
import { RoomType, PetColor } from '../types';
import { ROOM_THEMES, COLORS } from '../constants';

interface TopBarProps {
  currentRoom: RoomType;
  showColorPicker: boolean;
  setShowColorPicker: (show: boolean) => void;
  setPetColor: (color: PetColor) => void;
}

const TopBar: React.FC<TopBarProps> = ({ currentRoom, showColorPicker, setShowColorPicker, setPetColor }) => {
  const roomConfig = ROOM_THEMES[currentRoom];

  return (
    <>
      <div className="w-full px-6 flex justify-end items-center z-20">
        <button 
           onClick={() => setShowColorPicker(!showColorPicker)}
           className="bg-white/40 p-2 rounded-full backdrop-blur-sm hover:bg-white/60 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={roomConfig.accent}><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></svg>
        </button>
      </div>

      {showColorPicker && (
        <div className="absolute top-20 right-6 bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-xl z-30 grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-4">
           {COLORS.map((c) => (
             <button
               key={c.value}
               className="w-8 h-8 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
               style={{ backgroundColor: c.value }}
               onClick={() => {
                 setPetColor(c.value);
                 setShowColorPicker(false);
               }}
               title={c.label}
             />
           ))}
        </div>
      )}
    </>
  );
};

export default TopBar;