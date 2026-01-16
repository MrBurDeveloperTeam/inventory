
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Lock,
  Unlock,
  Map as MapIcon,
  ChevronDown,
  Layout,
  Image as ImageIcon,
  MessageCircle,
  Volume2
} from 'lucide-react';
import { Room, CatPosition } from './types';
import { PRESET_BLUEPRINTS } from './constants';

interface ClinicMapProps {
  rooms: Room[];
  blueprint: string | null;
  isLocked: boolean;
  isAddMode: boolean;
  isDeleteMode: boolean;
  onSetLocked?: (val: boolean) => void;
  onSetAddMode?: (val: boolean) => void;
  onSetDeleteMode?: (val: boolean) => void;
  onAddRoom?: (x: number, y: number) => void;
  onDeleteRoom?: (id: string) => void;
  onSelectRoom: (id: string) => void;
  onUpdateRooms?: (rooms: Room[]) => void;
  onDragEnd?: (roomId: string, x: number, y: number) => void;
  onSelectTemplate?: (url: string) => void;
  catPosition: CatPosition;
  onCatPositionChange?: (pos: CatPosition) => void;
  readOnly?: boolean;
  syncStatus?: 'synced' | 'syncing' | 'error';
}

const CAT_QUOTES = [
  "Meow-lar! Ready to count some floss?",
  "Purrr-fect inventory management!",
  "Is it time for a cat-scan?",
  "Don't forget to brush twice a day!",
  "Looking for the anesthesia? It's in the red room.",
  "Inventory looks paw-some today!",
  "Did someone say... Tuna paste?"
];

// High-quality static meow sound (respect base path for GH Pages / subfolders)
const MEOW_SOUND_URL = `${import.meta.env.BASE_URL || '/'}images/cat-meow.mp3`;

// Walking configuration
const CAT_SPEED = 0.08; // Seconds per % of distance

const ClinicMap: React.FC<ClinicMapProps> = ({
  rooms, blueprint, isLocked, isAddMode, isDeleteMode,
  onSetLocked, onSetAddMode, onSetDeleteMode,
  onAddRoom, onDeleteRoom, onSelectRoom, onUpdateRooms,
  onDragEnd,
  onSelectTemplate,
  catPosition, onCatPositionChange, readOnly = false,
  syncStatus = 'synced'
}) => {
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const activeTemplate = PRESET_BLUEPRINTS.find(t => t.url === blueprint);

  // Cat Mascot State
  const [catPos, setCatPos] = useState({ x: catPosition.x, y: catPosition.y });
  const [isWalking, setIsWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(true);
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleText, setBubbleText] = useState("");
  const [isMeowing, setIsMeowing] = useState(false);
  const [walkDuration, setWalkDuration] = useState(0.8);

  const mapRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const walkTimeoutRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // High-precision tracking for movement to fix the "slide" bug
  const lastMoveStartPos = useRef({ x: 20, y: 20 });
  const lastMoveStartTime = useRef(Date.now());
  const lastMoveDuration = useRef(0.8);
  const lastMoveTarget = useRef({ x: 20, y: 20 });

  const wasDraggingRef = useRef(false);
  const justDraggedRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setCatPos({ x: catPosition.x, y: catPosition.y });
  }, [catPosition.x, catPosition.y]);

  useEffect(() => {
    audioRef.current = new Audio(MEOW_SOUND_URL);

    const handleClickOutside = (event: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
        setShowTemplateMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const playMeow = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => console.log("Audio blocked:", err));
      setIsMeowing(true);
      setTimeout(() => setIsMeowing(false), 800);
    }
  };

  /**
   * Calculates the current interpolated visual position of the cat mascot
   * during an active CSS transition. This allows us to calculate accurate
   * distances for new movement commands and prevent the "sliding" glitch.
   */
  const getInterpolatedPos = () => {
    if (!isWalking) return catPos;
    const elapsed = (Date.now() - lastMoveStartTime.current) / 1000;
    const progress = Math.min(elapsed / lastMoveDuration.current, 1);
    return {
      x: lastMoveStartPos.current.x + (lastMoveTarget.current.x - lastMoveStartPos.current.x) * progress,
      y: lastMoveStartPos.current.y + (lastMoveTarget.current.y - lastMoveStartPos.current.y) * progress,
    };
  };

  const handleMapClick = (e: React.MouseEvent) => {
    if (!mapRef.current) return;

    // Fix for the double-click slide bug:
    // 1. Ignore double-click events as they can disrupt the linear movement state.
    if (e.detail > 1) return;

    const rect = mapRef.current.getBoundingClientRect();
    const targetX = ((e.clientX - rect.left) / rect.width) * 100;
    const targetY = ((e.clientY - rect.top) / rect.height) * 100;

    if (isAddMode && onAddRoom && !readOnly) {
      onAddRoom(targetX, targetY);
    } else if (!isDeleteMode && !isLocked && !readOnly) {
      // 2. Fix the "slide" bug by calculating distance from the ACTUAL visual position
      // rather than the previous logical target.
      const currentVisualPos = getInterpolatedPos();
      const distance = Math.sqrt(Math.pow(targetX - currentVisualPos.x, 2) + Math.pow(targetY - currentVisualPos.y, 2));

      // 3. Ignore redundant clicks if already very close to the intended spot
      if (distance < 1) return;

      const calculatedDuration = Math.max(0.3, distance * CAT_SPEED);

      // Update movement refs to track current journey state
      lastMoveStartPos.current = currentVisualPos;
      lastMoveTarget.current = { x: targetX, y: targetY };
      lastMoveStartTime.current = Date.now();
      lastMoveDuration.current = calculatedDuration;

      // Update React state for visual representation
      setFacingLeft(targetX < currentVisualPos.x);
      setWalkDuration(calculatedDuration);
      setCatPos({ x: targetX, y: targetY });
      onCatPositionChange?.({ x: targetX, y: targetY });
      setIsWalking(true);

      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = window.setTimeout(() => {
        setIsWalking(false);
      }, calculatedDuration * 1000);
    }
  };

  const handleCatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    playMeow();
    const randomQuote = CAT_QUOTES[Math.floor(Math.random() * CAT_QUOTES.length)];
    setBubbleText(randomQuote);
    setShowBubble(true);
    setTimeout(() => setShowBubble(false), 3000);
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // stop map click/add handlers from firing
    if (readOnly || isLocked || isAddMode || isDeleteMode) return;
    setDraggedRoomId(id);
    wasDraggingRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedRoomId === null || !mapRef.current) return;
    const dx = e.clientX - dragStartPosRef.current.x;
    const dy = e.clientY - dragStartPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) wasDraggingRef.current = true;

    if (wasDraggingRef.current && onUpdateRooms) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * 100, 0), 100);
      const y = Math.min(Math.max(((e.clientY - rect.top) / rect.height) * 100, 0), 100);
      onUpdateRooms(rooms.map(r => r.id === draggedRoomId ? { ...r, x, y } : r));
    }
  };

  const handleMouseUp = () => {
    if (wasDraggingRef.current && draggedRoomId !== null) {
      const room = rooms.find(r => r.id === draggedRoomId);
      if (room && onDragEnd) {
        onDragEnd(room.id, room.x, room.y);
      }
      justDraggedRef.current = true;
      // Clear the drag flag shortly after to avoid click firing the modal
      setTimeout(() => {
        wasDraggingRef.current = false;
        justDraggedRef.current = false;
      }, 0);
    }
    setDraggedRoomId(null);
  };

  const handleRoomClick = (roomId: string) => {
    if (isDeleteMode && onDeleteRoom && !readOnly) {
      onDeleteRoom(roomId);
      onSetDeleteMode?.(false);
      return;
    }
    onSelectRoom(roomId);
  };

  return (
    <section className="w-full bg-white rounded-[2rem] shadow-xl overflow-hidden relative border border-slate-100 h-[650px] flex flex-col">
      <style>{`
        @keyframes cat-walk {
          0% { transform: translateY(0) rotate(0); }
          25% { transform: translateY(-3px) rotate(-4deg); }
          50% { transform: translateY(0) rotate(0); }
          75% { transform: translateY(-3px) rotate(4deg); }
          100% { transform: translateY(0) rotate(0); }
        }
        @keyframes shadow-breathe {
          0%, 50%, 100% { transform: scale(1); opacity: 0.15; }
          25%, 75% { transform: scale(0.85); opacity: 0.1; }
        }
        .animate-cat-natural-walk {
          animation: cat-walk 0.3s infinite ease-in-out;
        }
        .animate-cat-shadow {
          animation: shadow-breathe 0.3s infinite ease-in-out;
        }
        @keyframes sound-wave {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .animate-sound {
          animation: sound-wave 0.6s ease-out forwards;
        }
      `}</style>

      <div className="p-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-emerald-600" />
            <span className="text-xl font-bold text-slate-700 tracking-wide">Interactive Clinic Blueprint</span>
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all duration-300 ${syncStatus === 'syncing' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
            syncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
              'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-indigo-500 animate-pulse' :
              syncStatus === 'error' ? 'bg-rose-500' :
                'bg-emerald-500'
              }`} />
            {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'error' ? 'Sync Error' : 'Live & Synced'}
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => onSetLocked?.(!isLocked)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs transition-all shadow-sm border ${isLocked ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-[#f0f4f8] text-[#475569] border-transparent hover:bg-slate-200'}`}>
                {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />} {isLocked ? 'Locked' : 'Unlocked'}
              </button>
              <div className="h-5 w-px bg-slate-200" />
              <button disabled={isLocked} onClick={() => { onSetAddMode?.(!isAddMode); onSetDeleteMode?.(false); }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs transition-all shadow-sm border ${isAddMode ? 'bg-[#e7f9f2] text-[#059669] border-[#059669]/20' : 'bg-[#e7f9f2] text-[#059669] hover:bg-[#d1f2e6] border-transparent disabled:opacity-50'}`}>
                <Plus className="w-3 h-3" /> Add Room
              </button>
              <button disabled={isLocked} onClick={() => { onSetDeleteMode?.(!isDeleteMode); onSetAddMode?.(false); }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs transition-all shadow-sm border ${isDeleteMode ? 'bg-[#fff1f2] text-[#e11d48] border-[#e11d48]/20' : 'bg-[#fff1f2] text-[#e11d48] hover:bg-[#ffe4e6] border-transparent disabled:opacity-50'}`}>
                <Trash2 className="w-3 h-3" /> Delete Mode
              </button>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-3 relative" ref={templateMenuRef}>
              <button onClick={() => setShowTemplateMenu(!showTemplateMenu)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm tracking-wide">
                <Layout className="w-4 h-4 text-emerald-600" /> {activeTemplate ? activeTemplate.name : 'Select Template'} <ChevronDown className={`w-4 h-4 transition-transform ${showTemplateMenu ? 'rotate-180' : ''}`} />
              </button>
              {showTemplateMenu && (
                <div className="absolute top-full right-0 mt-3 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[60] overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-3 space-y-1">
                    {PRESET_BLUEPRINTS.map(t => (
                      <button key={t.id} onClick={() => { onSelectTemplate?.(t.url); setShowTemplateMenu(false); }} className="w-full flex items-start gap-4 p-4 rounded-xl hover:bg-emerald-50 group transition-colors text-left">
                        <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-sm">
                          <img src={t.url} className="w-full h-full object-cover" alt={t.name} />
                        </div>
                        <div><p className="text-xs font-black text-slate-800 group-hover:text-emerald-700">{t.name}</p><p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-1">{t.description}</p></div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div
        ref={mapRef}
        className={`flex-1 relative overflow-hidden bg-slate-50 ${isAddMode ? 'cursor-crosshair' : draggedRoomId !== null ? 'cursor-grabbing' : ''}`}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {blueprint ? <img src={blueprint} alt="Clinic Blueprint" className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none opacity-95 transition-opacity" draggable={false} /> : <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 pointer-events-none"><ImageIcon className="w-32 h-32 mb-6 text-slate-400" /><p className="text-2xl font-black uppercase tracking-[0.3em] text-slate-400">No Layout Uploaded</p></div>}

        {/* Cat Mascot "Molar" */}
        <div
          onClick={handleCatClick}
          className={`absolute z-30 cursor-pointer hover:scale-110`}
          style={{
            left: `${catPos.x}%`,
            top: `${catPos.y}%`,
            transition: `left ${walkDuration}s linear, top ${walkDuration}s linear, transform 0.2s ease-out`,
            transform: `translate(-50%, -100%) scaleX(${facingLeft ? 1 : -1})`,
          }}
        >
          {isMeowing && (
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-sound" style={{ transform: 'translate(-50%, -50%)' }} />
          )}

          <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-2 bg-black rounded-[100%] blur-[2px] transition-opacity ${isWalking ? 'animate-cat-shadow' : 'opacity-15'}`} />

          {showBubble && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-white text-slate-800 px-4 py-2 rounded-2xl shadow-xl border border-slate-100 text-[10px] font-bold whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-300 z-40" style={{ transform: `translateX(-50%) scaleX(${facingLeft ? 1 : -1})` }}>
              <div className="relative">
                {bubbleText}
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white"></div>
              </div>
            </div>
          )}

          <div className={`text-4xl select-none relative z-10 ${isWalking ? 'animate-cat-natural-walk' : ''}`}>
            🐈
          </div>
        </div>

        {rooms.map(room => (
          <div
            key={room.id}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-95 z-20 group ${draggedRoomId === room.id ? 'z-50 scale-110 cursor-grabbing hexagon-glow-active' : isDeleteMode ? 'hexagon-glow-rose' : 'hover:scale-105 cursor-pointer hexagon-glow'}`}
            style={{ left: `${room.x}%`, top: `${room.y}%` }}
            onMouseDown={(e) => handleMouseDown(e, room.id)}
            onClick={(e) => {
              e.stopPropagation();
              if (wasDraggingRef.current || justDraggedRef.current) {
                justDraggedRef.current = false;
                wasDraggingRef.current = false;
                return;
              }
              handleRoomClick(room.id);
            }}
          >
            <div className={`hexagon w-16 h-16 md:w-20 md:h-20 flex flex-col items-center justify-center p-2 text-center transition-colors ${isDeleteMode ? 'bg-rose-600 text-white shadow-xl shadow-rose-500/30' : draggedRoomId === room.id ? 'bg-[#4d9678] text-white shadow-xl shadow-emerald-500/30' : 'bg-white/95 text-slate-800 shadow-xl border border-white/50'}`}>
              <span className="text-[8px] md:text-[11px] font-bold leading-tight break-words max-w-[80px] pointer-events-none tracking-normal">{room.name}</span>
              <span className={`text-[7px] md:text-[8px] mt-1 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider pointer-events-none ${isDeleteMode || draggedRoomId === room.id ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>{room.items.length} SKU</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ClinicMap;
