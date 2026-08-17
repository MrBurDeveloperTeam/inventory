
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Lock,
  Unlock,
  Map as MapIcon,
  ChevronDown,
  Layout,
  Image as ImageIcon
} from 'lucide-react';
import { Room, CatPosition, Item, ActivityLog, Category, UOM, ItemBatch } from './types';
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
  onReceive?: (roomId: string, itemData: any, qty: number, price: number, purchaseDate: string, expiry?: string) => void;
  onOpenChat?: () => void;
  onOpenVirtualPet?: () => void;
  readOnly?: boolean;
  syncStatus?: 'synced' | 'syncing' | 'error';
}

const ClinicMap: React.FC<ClinicMapProps> = ({
  rooms, blueprint, isLocked, isAddMode, isDeleteMode,
  onSetLocked, onSetAddMode, onSetDeleteMode,
  onAddRoom, onDeleteRoom, onSelectRoom, onUpdateRooms,
  onDragEnd,
  onSelectTemplate,
  readOnly = false,
  syncStatus = 'synced'
}) => {
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const activeTemplate = PRESET_BLUEPRINTS.find(t => t.url === blueprint);

  const mapRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  const wasDraggingRef = useRef(false);
  const justDraggedRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
        setShowTemplateMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMapClick = (e: React.MouseEvent) => {
    if (!mapRef.current) return;
    if (e.detail > 1) return;

    const rect = mapRef.current.getBoundingClientRect();
    const targetX = ((e.clientX - rect.left) / rect.width) * 100;
    const targetY = ((e.clientY - rect.top) / rect.height) * 100;

    if (isAddMode && onAddRoom && !readOnly) {
      onAddRoom(targetX, targetY);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
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
    <section className="w-full bg-white rounded-none md:rounded-[2rem] shadow-xl overflow-hidden relative border-x-0 md:border border-slate-100 h-[650px] flex flex-col">
      <style>{`
        @keyframes sound-wave {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        .animate-sound {
          animation: sound-wave 0.6s ease-out forwards;
        }
      `}</style>

      <div className="px-3 py-4 md:p-5 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-4">
        <div className="flex flex-wrap items-center gap-3 justify-between md:justify-start w-full md:w-auto">
          <div className="flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-lg md:text-xl font-bold text-slate-700 tracking-wide">Interactive Clinic</span>
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all duration-300 ${syncStatus === 'syncing' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
            syncStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
              'bg-emerald-50 text-emerald-600 border-emerald-100'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'syncing' ? 'bg-indigo-500 animate-pulse' :
              syncStatus === 'error' ? 'bg-rose-500' :
                'bg-emerald-500'
              }`} />
            <span className="whitespace-nowrap">
              {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'error' ? 'Sync Error' : 'LIVE & SYNCED'}
            </span>
          </div>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto select-none">
            <button
              onClick={() => onSetLocked?.(!isLocked)}
              title={isLocked ? 'Locked' : 'Unlocked'}
              className={`shrink-0 w-11 md:w-auto flex items-center justify-center gap-2 px-2 py-2 rounded-xl font-bold text-[12px] transition-all shadow-sm border ${isLocked ? 'bg-amber-50 text-amber-600 border-amber-100 shadow-amber-100/20' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5 text-emerald-500" />}
              <span className="hidden md:inline">{isLocked ? 'Locked' : 'Unlocked'}</span>
            </button>

            <div className="hidden md:block h-5 w-px bg-slate-200 shrink-0" />

            <button
              disabled={isLocked}
              onClick={() => { onSetAddMode?.(!isAddMode); onSetDeleteMode?.(false); }}
              title="Add Room"
              className={`flex-initial flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl font-bold text-[12px] transition-all shadow-sm border ${isAddMode ? 'bg-emerald-500 text-white border-transparent shadow-emerald-200/50' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100/50 disabled:opacity-40 disabled:grayscale'}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>

            <button
              disabled={isLocked}
              onClick={() => { onSetDeleteMode?.(!isDeleteMode); onSetAddMode?.(false); }}
              title="Delete Mode"
              className={`flex-initial flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl font-bold text-[12px] transition-all shadow-sm border ${isDeleteMode ? 'bg-rose-500 text-white border-transparent shadow-rose-200/50' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-100/50 disabled:opacity-40 disabled:grayscale'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            <div className="hidden md:block h-6 w-px bg-slate-200 shrink-0" />

            <div className="flex-1 md:flex-initial flex items-center relative shrink-0 min-w-0" ref={templateMenuRef}>
              <button
                onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm tracking-wide active:scale-95 min-w-0"
              >
                <Layout className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{activeTemplate ? activeTemplate.name : 'Template'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${showTemplateMenu ? 'rotate-180' : ''}`} />
              </button>

              {showTemplateMenu && (
                <div className="absolute top-full right-0 mt-3 w-64 sm:w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[60] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                  <div className="p-2 space-y-1">
                    {PRESET_BLUEPRINTS.map(t => (
                      <button
                        key={t.id}
                        onClick={() => { onSelectTemplate?.(t.url); setShowTemplateMenu(false); }}
                        className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-emerald-50 group transition-all text-left border border-transparent hover:border-emerald-100"
                      >
                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-sm transition-transform group-hover:scale-105">
                          <img src={t.url} className="w-full h-full object-cover" alt={t.name} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate">{t.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5 line-clamp-2">{t.description}</p>
                        </div>
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
