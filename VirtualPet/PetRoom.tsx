import React, { useState, useEffect, useRef } from 'react';
import { RoomType, FoodItem, Bubble, ToolType } from './types';
import { ROOM_THEMES, FOOD_ITEMS, TOY_ITEMS } from './constants';
import Pet from './components/Pet';
import StatsBar from './components/StatsBar';
import BottomControls from './components/BottomControls';
import { FoodMenu, BathroomMenu, GamesMenu } from './components/RoomMenus';
import DragLayer from './components/DragLayer';
import Ball from './components/Ball';
import ShopModal from './components/ShopModal';
import ToyShopModal from './components/ToyShopModal';
import { FridgeModal } from './components/FridgeModal';
import { useGameState } from './hooks/useGameState';
import { useBallPhysics } from './hooks/useBallPhysics';
import LevelIndicator from './components/LevelIndicator';
import CoinIndicator from './components/CoinIndicator';

const MAX_BUBBLES = 120;

interface PetRoomProps {
  onNavigateToGame: (gameId: string) => void;
}

export const PetRoom: React.FC<PetRoomProps> = ({ onNavigateToGame }) => {
  // --- Custom Hooks for Logic ---
  const {
    stats, setStats,
    petName,
    petColor, setPetColor,
    currentRoom, setCurrentRoom,
    isSleeping, setIsSleeping,
    isEating, setIsEating,
    isPlaying, setIsPlaying,
    inventory, buyItem, consumeItem,
    addXP, activeBallId, setActiveBallId
  } = useGameState();

  const {
    ballPos, setBallPos,
    isDraggingBall, setIsDraggingBall,
    isBallMoving,
    ballVel, lastDragPos
  } = useBallPhysics(currentRoom);

  useEffect(() => {
    if (currentRoom === RoomType.PLAYROOM) {
      // Reset ball to bottom center when entering playroom
      setBallPos({
        x: window.innerWidth / 2,
        y: window.innerHeight - 100 // 100px from bottom
      });
      ballVel.current = { vx: 0, vy: 0 };
    }
  }, [currentRoom, setBallPos]);

  // --- Local UI State ---
  const [showFoodMenu, setShowFoodMenu] = useState(false);
  const [showBathroomMenu, setShowBathroomMenu] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showFridgeModal, setShowFridgeModal] = useState(false);
  const [showToyShop, setShowToyShop] = useState(false);


  // Drag & Drop / Tool State
  const [draggedItem, setDraggedItem] = useState<FoodItem | null>(null);
  const [draggedTool, setDraggedTool] = useState<ToolType | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isHoveringPet, setIsHoveringPet] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [isSoapedUp, setIsSoapedUp] = useState(false);

  // Pointer/Eye Tracking State
  const [pointerState, setPointerState] = useState<{ isDown: boolean, x: number, y: number }>({ isDown: false, x: 0, y: 0 });

  const petRef = useRef<HTMLDivElement>(null);
  const lastBubbleTime = useRef(0);

  // Manage Soaped State (Hysteresis)
  useEffect(() => {
    if (bubbles.length >= MAX_BUBBLES) {
      setIsSoapedUp(true);
    } else if (bubbles.length === 0 && isSoapedUp) {
      // Add a delay before resetting soaped state to show "Clean" message
      const timer = setTimeout(() => {
        setIsSoapedUp(false);
      }, 2000);
      return () => clearTimeout(timer);
    } else if (bubbles.length === 0 && !isSoapedUp) {
      // Immediate reset if not previously soaped (initial state)
      setIsSoapedUp(false);
    }
  }, [bubbles.length, isSoapedUp]);

  // --- Handlers ---
  const handleDragStartItem = (e: React.PointerEvent, item: FoodItem) => {
    e.preventDefault();
    setDraggedItem(item);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handleDragStartTool = (e: React.PointerEvent, tool: ToolType) => {
    e.preventDefault();
    setDraggedTool(tool);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handleBallDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingBall(true);
    ballVel.current = { vx: 0, vy: 0 };
    lastDragPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  // Global Pointer Handlers for Dragging & Looking
  const handleAppPointerDown = (e: React.PointerEvent) => {
    // Check if we are interacting with modal, if so, don't trigger pointer tracking for eyes immediately if overlay covers
    setPointerState({ isDown: true, x: e.clientX, y: e.clientY });
  };

  const handleAppPointerMove = (e: React.PointerEvent) => {
    // 1. Update general look-at pointer state
    if (pointerState.isDown && !isDraggingBall) {
      setPointerState(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
    }

    // 2. Handle Item/Tool Dragging
    if (draggedItem || draggedTool) {
      setDragPos({ x: e.clientX, y: e.clientY });
      setPointerState({ isDown: true, x: e.clientX, y: e.clientY });

      // Hover checks...
      if (petRef.current) {
        const rect = petRef.current.getBoundingClientRect();
        const isOver =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        setIsHoveringPet(isOver);

        if (isOver && draggedTool) {
          const now = Date.now();
          const relX = ((e.clientX - rect.left) / rect.width) * 200;
          const relY = ((e.clientY - rect.top) / rect.height) * 200;

          if (draggedTool === 'soap') {
            if (now - lastBubbleTime.current > 50) {
              const newBubble: Bubble = {
                id: now,
                x: relX + (Math.random() * 20 - 10),
                y: relY + (Math.random() * 20 - 10),
                size: Math.random() * 12 + 7
              };

              setBubbles(prev => {
                if (prev.length >= MAX_BUBBLES) return prev;
                return [...prev, newBubble];
              });
              lastBubbleTime.current = now;
            }
          } else if (draggedTool === 'shower') {
            // Only allow rinsing if we have reached the fully soaped state
            if (isSoapedUp) {
              setBubbles(prev => {
                const remaining = prev.filter(b => {
                  const distX = Math.abs(b.x - relX);
                  const isUnderShower = distX < 25 && (b.y > relY && b.y < relY + 150);
                  return !isUnderShower;
                });
                if (remaining.length < prev.length && stats.hygiene < 100) {
                  setStats(s => ({ ...s, hygiene: Math.min(100, s.hygiene + 0.5) }));
                }
                return remaining;
              });
            }
          }
        }
      }
    }

    // 3. Handle Ball Dragging (Physics Interaction)
    if (isDraggingBall) {
      const now = Date.now();
      const dt = now - lastDragPos.current.time;
      if (dt > 0) {
        const vx = (e.clientX - lastDragPos.current.x) * 0.7;
        const vy = (e.clientY - lastDragPos.current.y) * 0.7;
        ballVel.current = { vx, vy };
      }
      lastDragPos.current = { x: e.clientX, y: e.clientY, time: now };
      setBallPos({ x: e.clientX, y: e.clientY });
    }
  };

  const onFeed = (item: FoodItem) => {
    if (stats.hunger >= 100 || isSleeping) return;

    // Ensure we have the item
    if ((inventory[item.id] || 0) <= 0) return;

    consumeItem(item.id);
    setIsEating(true);
    setStats(prev => ({
      ...prev,
      hunger: Math.min(100, prev.hunger + item.hunger),
      // Food no longer increases energy
      happiness: Math.min(100, prev.happiness + (item.happiness || 0)),
    }));
    addXP(item.xp);
    setTimeout(() => setIsEating(false), 1000);
  };

  const handleAppPointerUp = (e: React.PointerEvent) => {
    setPointerState(prev => ({ ...prev, isDown: false }));

    // Drop Item/Tool
    if (draggedItem) {
      if (isHoveringPet) onFeed(draggedItem);
      setDraggedItem(null);
    }
    if (draggedTool) {
      setDraggedTool(null);
      if (draggedTool === 'shower' && isHoveringPet && isSoapedUp) {
        if (stats.hygiene > 90) addXP(5);
      }
    }
    setIsHoveringPet(false);

    // Drop Ball
    if (isDraggingBall) {
      setIsDraggingBall(false);
    }
  };

  // --- Game Actions ---
  const handlePlay = () => {
    if (stats.energy < 20) return;
    if (isSleeping) return;

    setIsPlaying(true);
    setStats(prev => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 15),
      energy: Math.max(0, prev.energy - 10),
      hunger: Math.max(0, prev.hunger - 5)
    }));
    addXP(15);
    setTimeout(() => setIsPlaying(false), 800);
  };

  const handlePetClick = () => {
    if (isSleeping) {
      setIsSleeping(false);
      return;
    }
    setStats(prev => ({ ...prev, happiness: Math.min(100, prev.happiness + 5) }));
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 500);
  };


  // Room switching cleanup & auto-show menus
  useEffect(() => {
    if (currentRoom === RoomType.KITCHEN) {
      setShowFoodMenu(true);
    } else {
      setShowFoodMenu(false);
    }

    if (currentRoom === RoomType.BATHROOM) {
      setShowBathroomMenu(true);
    } else {
      setShowBathroomMenu(false);
      setBubbles([]);
      setIsSoapedUp(false);
    }
  }, [currentRoom]);

  const roomConfig = ROOM_THEMES[currentRoom];

  const handleStartGame = (gameId: string) => {
    onNavigateToGame(gameId);
  };

  return (
    <div
      className={`h-screen w-full relative transition-colors duration-700 ease-in-out ${roomConfig.bg} overflow-hidden flex flex-col items-center justify-between py-6`}
      onPointerDown={handleAppPointerDown}
      onPointerMove={handleAppPointerMove}
      onPointerUp={handleAppPointerUp}
      onPointerLeave={handleAppPointerUp}
    >

      {/* Dark Overlay for Sleep Mode (Global) */}
      {currentRoom === RoomType.BEDROOM && isSleeping && (
        <div className="absolute inset-0 bg-black/60 z-20 pointer-events-none transition-all duration-700 animate-in fade-in" />
      )}

      {/* Bedroom Lamp Switch */}
      {currentRoom === RoomType.BEDROOM && (
        <div className="absolute top-0 left-1/3 z-10 flex flex-col items-center">
          {/* Lamp Cord - Changed h-32 to h-48 */}
          <div className="w-1 h-48 bg-slate-800/80" />
          {/* Lamp Bulb */}
          <button
            onClick={() => setIsSleeping(!isSleeping)}
            // Added 'rotate-180' to flip the emoji upside down
            className="text-6xl -mt-2 transition-all duration-300 hover:scale-110 active:scale-95 outline-none rotate-180"
            title={isSleeping ? "Turn On" : "Turn Off"}
          >
            <div className={`transition-all duration-500 ${isSleeping ? 'grayscale opacity-50 blur-[1px]' : 'filter drop-shadow-[0_0_25px_rgba(255,235,59,0.8)]'}`}>
              💡
            </div>
          </button>
        </div>
      )}

      {/* Top Right UI */}
      <LevelIndicator stats={stats} onColorChange={setPetColor} />
      <CoinIndicator amount={stats.coins || 0} />

      {/* Stats HUD (Top Center) */}
      <StatsBar stats={stats} />

      {/* Soap/Shower Progress (Bathroom) */}
      {currentRoom === RoomType.BATHROOM && (bubbles.length > 0 || isSoapedUp) && (
        <div className="absolute top-48 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 pointer-events-none select-none">

          {/* Progress Bar Container */}
          <div className={`w-48 h-2.5 bg-white/40 backdrop-blur-md rounded-full overflow-hidden shadow-lg ring-2 transition-all duration-500
            ${isSoapedUp && bubbles.length === MAX_BUBBLES
              ? 'scale-110 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]'
              : 'ring-white/40'}
            ${bubbles.length === 0 ? 'ring-green-400' : ''}    
          `}>

            <div
              className={`h-full transition-all duration-300 ease-out relative
                ${!isSoapedUp ? 'bg-gradient-to-r from-pink-300 to-purple-400' : ''}
                ${isSoapedUp && bubbles.length === MAX_BUBBLES ? 'bg-cyan-400 animate-pulse' : ''}
                ${isSoapedUp && bubbles.length < MAX_BUBBLES ? 'bg-gradient-to-r from-blue-400 to-cyan-500' : ''}
              `}
              style={{
                width: `${(isSoapedUp && (bubbles.length < MAX_BUBBLES || bubbles.length === 0))
                  ? (1 - (bubbles.length / MAX_BUBBLES)) * 100 // Rinsing: 0 -> 100%
                  : (bubbles.length / MAX_BUBBLES) * 100       // Soaping or Ready: 0 -> 100%
                  }%`
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>
        </div>
      )}

      {/* The Pet */}
      <div className="flex-1 flex items-center justify-center relative w-full">
        <Pet
          ref={petRef}
          color={petColor}
          stats={stats}
          isSleeping={isSleeping}
          isEating={isEating}
          isPlaying={isPlaying}
          isHoveredWithFood={isHoveringPet && !!draggedItem}
          bubbles={bubbles}
          lookAt={
            currentRoom === RoomType.PLAYROOM
              ? (isBallMoving ? ballPos : null)
              : (pointerState.isDown ? { x: pointerState.x, y: pointerState.y } : null)
          }
          onClick={handlePetClick}
        />

        {/* Room Specific Decor */}
        {currentRoom === RoomType.BATHROOM && (
          <div className="absolute bottom-10 right-10 opacity-50 text-6xl animate-float">🦆</div>
        )}
        {currentRoom === RoomType.GAMES && (
          // Icon removed as requested
          null
        )}

        {/* Playroom Store Button */}
        {currentRoom === RoomType.PLAYROOM && (
          <button
            onClick={() => setShowToyShop(true)}
            className="absolute bottom-10 right-10 bg-white/40 hover:bg-white/60 backdrop-blur-md p-4 rounded-3xl border-4 border-pink-200 shadow-xl transition-all hover:scale-110 active:scale-95 group z-30"
          >
            <div className="text-4xl group-hover:rotate-12 transition-transform">🏪</div>
            <div className="mt-1 text-[10px] font-black text-pink-500 uppercase tracking-widest">Toy Shop</div>
          </button>
        )}
      </div>

      {/* Playroom Ball */}
      {currentRoom === RoomType.PLAYROOM && (
        <Ball
          position={ballPos}
          isDragging={isDraggingBall}
          onPointerDown={handleBallDown}
          color={TOY_ITEMS.find(t => t.id === activeBallId)?.color}
          icon={TOY_ITEMS.find(t => t.id === activeBallId)?.icon}
        />
      )}

      {/* Menus */}
      {showFoodMenu && currentRoom === RoomType.KITCHEN && (
        <FoodMenu
          onDragStart={handleDragStartItem}
          inventory={inventory}
          onOpenShop={() => setShowShopModal(true)}
          onOpenFridge={() => setShowFridgeModal(true)}
        />
      )}

      {showBathroomMenu && currentRoom === RoomType.BATHROOM && (
        <BathroomMenu
          onDragStart={handleDragStartTool}
          isSoapedUp={isSoapedUp}
          isDirty={stats.hygiene < 60}
        />
      )}

      {currentRoom === RoomType.GAMES && (
        <GamesMenu onStartGame={handleStartGame} />
      )}

      {/* Drag Visuals */}
      <DragLayer
        draggedItem={draggedItem}
        draggedTool={draggedTool}
        dragPos={dragPos}
        bubbles={bubbles}
        isHoveringPet={isHoveringPet}
        isSoapedUp={isSoapedUp}
      />

      {/* Bottom Controls */}
      <BottomControls
        currentRoom={currentRoom}
        isSleeping={isSleeping}
        onNavigate={(room) => setCurrentRoom(room)}
        onToggleSleep={() => setIsSleeping(!isSleeping)}
        onToggleFoodMenu={() => setShowFoodMenu(!showFoodMenu)}
        onToggleBathroomMenu={() => setShowBathroomMenu(!showBathroomMenu)}
        showFoodMenu={showFoodMenu}
        showBathroomMenu={showBathroomMenu}
      />

      {/* Modals */}
      <ShopModal
        isOpen={showShopModal}
        onClose={() => setShowShopModal(false)}
        items={FOOD_ITEMS}
        inventory={inventory}
        coins={stats.coins}
        currentLevel={stats.level}
        onBuy={(item) => buyItem(item.id, item.price)}
      />

      <FridgeModal
        isOpen={showFridgeModal}
        onClose={() => setShowFridgeModal(false)}
        items={FOOD_ITEMS}
        inventory={inventory}
        onFeed={onFeed}
        onOpenShop={() => {
          setShowFridgeModal(false);
          setShowShopModal(true);
        }}
      />

      <ToyShopModal
        isOpen={showToyShop}
        onClose={() => setShowToyShop(false)}
        items={TOY_ITEMS}
        inventory={inventory}
        coins={stats.coins}
        currentLevel={stats.level}
        activeBallId={activeBallId}
        onBuy={(toy) => buyItem(toy.id, toy.price)}
        onSelect={(id) => setActiveBallId(id)}
      />

    </div>
  );
};
