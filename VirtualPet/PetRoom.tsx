import React, { useState, useEffect, useRef } from 'react';
import { RoomType, FoodItem, Bubble, ToolType } from './types';
import { BED_ITEMS, ROOM_THEMES, TOY_ITEMS } from './constants';
import Pet, { PetPose } from './components/Pet';
import StatsBar from './components/StatsBar';
import BottomControls from './components/BottomControls';
import { FoodMenu, BathroomMenu, GamesMenu } from './components/RoomMenus';
import DragLayer from './components/DragLayer';
import Ball from './components/Ball';
import ShopModal from './components/ShopModal';
import { useGameState } from './hooks/useGameState';
import { useBallPhysics } from './hooks/useBallPhysics';
import LevelIndicator from './components/LevelIndicator';
import CoinIndicator from './components/CoinIndicator';
import { getPetOption } from './petOptions';

const MAX_BUBBLES = 120;
const RINSE_COMPLETE_THRESHOLD = Math.ceil(MAX_BUBBLES * 0.05);
const POOP_REWARD_COINS = 5;
const POOP_RESPAWN_MS = 2 * 60 * 60 * 1000;
const POOP_NEXT_SPAWN_KEY = 'virtual_pet_next_poop_at';
const OUTSIDE_PET_SCALE = 0.75;
const SLEEP_WAKE_DURATION_MS = 760;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

interface PetRoomProps {
  onNavigateToGame: (gameId: string) => void;
}

export const PetRoom: React.FC<PetRoomProps> = ({ onNavigateToGame }) => {
  // --- Custom Hooks for Logic ---
  const {
    stats, setStats,
    petName,
    currentRoom, setCurrentRoom,
    isSleeping, setIsSleeping,
    isEating, setIsEating,
    isPlaying, setIsPlaying,
    inventory, buyItem, consumeItem,
    addXP, activeBallId, setActiveBallId, activeBedId, setActiveBedId,
    foodItems, isFoodLoading, currencyRate
  } = useGameState();
  const activePet = getPetOption(petName);

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
  const [isPoopVisible, setIsPoopVisible] = useState(false);
  const [showPoopReward, setShowPoopReward] = useState(false);


  // Drag & Drop / Tool State
  const [draggedItem, setDraggedItem] = useState<FoodItem | null>(null);
  const [draggedTool, setDraggedTool] = useState<ToolType | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isHoveringPet, setIsHoveringPet] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [isSoapedUp, setIsSoapedUp] = useState(false);
  const [outsidePetPos, setOutsidePetPos] = useState({ x: 0, y: 0 });
  const [outsidePetPose, setOutsidePetPose] = useState<PetPose>('idle');

  // Pointer/Eye Tracking State
  const [pointerState, setPointerState] = useState<{ isDown: boolean, x: number, y: number }>({ isDown: false, x: 0, y: 0 });

  const playAreaRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const lastBubbleTime = useRef(0);
  const lastBallPlayTime = useRef(0);
  const ballPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outsidePetPosRef = useRef(outsidePetPos);
  const outsidePetRaf = useRef<number>(0);
  const ballPosRef = useRef(ballPos);
  const outsideBallTargetRef = useRef<{ x: number; y: number } | null>(null);
  const outsideWakeUntilRef = useRef(0);
  const isBallMovingRef = useRef(isBallMoving);
  const isDraggingBallRef = useRef(isDraggingBall);
  const activeSoapType = useRef<'soap' | null>(null);
  const soapConsumedOnRinse = useRef(false);
  const activeSoapMultiplier = useRef(1);

  useEffect(() => {
    outsidePetPosRef.current = outsidePetPos;
  }, [outsidePetPos]);

  useEffect(() => {
    ballPosRef.current = ballPos;
  }, [ballPos]);

  useEffect(() => {
    isBallMovingRef.current = isBallMoving;
  }, [isBallMoving]);

  useEffect(() => {
    isDraggingBallRef.current = isDraggingBall;
  }, [isDraggingBall]);

  const getSoapItem = () => foodItems.find((item) => item.id === 'soap' && item.category === 'Soap');

  const getBedItem = (id: string | null) => {
    if (!id) return null;
    const shopBed = foodItems.find((item) => item.id === id && item.category === 'Beds');
    const fallback = BED_ITEMS.find((bed) => bed.id === id);
    if (!shopBed && !fallback) return null;

    return {
      id,
      src: shopBed?.imageSrc || fallback?.src || '',
      energyGain: shopBed?.energyGain || fallback?.energyGain || 1,
    };
  };

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM || !playAreaRef.current) return;

    const rect = playAreaRef.current.getBoundingClientRect();
    const initialPos = {
      x: rect.width / 2,
      y: Math.max(190, rect.height / 2),
    };
    outsidePetPosRef.current = initialPos;
    setOutsidePetPos(initialPos);
    setOutsidePetPose('idle');
  }, [currentRoom]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const syncPoopVisibility = () => {
      const nextSpawnAt = Number(localStorage.getItem(POOP_NEXT_SPAWN_KEY) || 0);
      const now = Date.now();

      if (!nextSpawnAt || now >= nextSpawnAt) {
        setIsPoopVisible(true);
        return;
      }

      setIsPoopVisible(false);
      timeoutId = setTimeout(syncPoopVisibility, nextSpawnAt - now);
    };

    syncPoopVisibility();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Manage Soaped State (Hysteresis)
  useEffect(() => {
    if (bubbles.length >= MAX_BUBBLES) {
      setIsSoapedUp(true);
    } else if (bubbles.length === 0 && isSoapedUp) {
      // Add a delay before resetting soaped state to show "Clean" message
      const timer = setTimeout(() => {
        setIsSoapedUp(false);
      }, 800);
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
    outsideBallTargetRef.current = null;
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
            if (!activeSoapType.current) {
              activeSoapType.current = 'soap';
              soapConsumedOnRinse.current = false;
              const soapItem = getSoapItem();
              activeSoapMultiplier.current = Math.max(1, (soapItem?.hygiene || 50) / 50);
            }

            if (now - lastBubbleTime.current > 50) {
              const newBubble: Bubble = {
                id: now,
                x: clamp(relX + (Math.random() * 20 - 10), 36, 164),
                y: clamp(relY + (Math.random() * 20 - 10), 20, 190),
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
                const rinsedBubbles = remaining.length <= RINSE_COMPLETE_THRESHOLD ? [] : remaining;
                if (rinsedBubbles.length < prev.length && stats.hygiene < 100) {
                  setStats(s => ({ ...s, hygiene: Math.min(100, s.hygiene + (0.5 * activeSoapMultiplier.current)) }));
                }
                if (rinsedBubbles.length === 0 && prev.length > 0 && activeSoapType.current && !soapConsumedOnRinse.current) {
                  soapConsumedOnRinse.current = true;
                  activeSoapType.current = null;
                  activeSoapMultiplier.current = 1;
                }
                return rinsedBubbles;
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
      outsideBallTargetRef.current = { x: e.clientX, y: e.clientY };
      if (currentRoom === RoomType.PLAYROOM && isSleeping) {
        outsideWakeUntilRef.current = Date.now() + SLEEP_WAKE_DURATION_MS;
        setIsSleeping(false);
      }
      setIsDraggingBall(false);
    }
  };

  // --- Game Actions ---
  // const handlePlay = () => {
  //   if (stats.energy < 20) return;
  //   if (isSleeping) return;

  //   setIsPlaying(true);
  //   setStats(prev => ({
  //     ...prev,
  //     happiness: Math.min(100, prev.happiness + 15),
  //     energy: Math.max(0, prev.energy - 10),
  //     hunger: Math.max(0, prev.hunger - 5)
  //   }));
  //   addXP(15);
  //   setTimeout(() => setIsPlaying(false), 800);
  // };

  const handlePetClick = () => {
    if (isSleeping) {
      setIsSleeping(false);
      return;
    }
    setStats(prev => ({ ...prev, happiness: Math.min(100, prev.happiness + 5) }));
  };

  const handlePoopClick = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const nextSpawnAt = Date.now() + POOP_RESPAWN_MS;
    localStorage.setItem(POOP_NEXT_SPAWN_KEY, String(nextSpawnAt));
    setIsPoopVisible(false);
    setShowPoopReward(false);
    window.setTimeout(() => setShowPoopReward(true), 0);
    window.setTimeout(() => setShowPoopReward(false), 1500);
    setStats(prev => ({ ...prev, coins: (prev.coins || 0) + POOP_REWARD_COINS }));
  };


  async function handlePlay(gameId: string) {
    const sessionInfo = await api.post('/web/session/get_session_info', {
      credentials: 'include',
    });
    console.log('Session Info:', sessionInfo);
    const odooPartnerId = sessionInfo.data.result.partner_id;
    const userId = sessionInfo.data.result.uid;
    const sessionId = crypto.randomUUID();

    const allowed = await consumeGameCredit(odooPartnerId, userId, sessionId);

    if (allowed) {
      onNavigateToGame(gameId);
    } else {
      // setError('Insufficient credits. Please top up your Snabbb balance.');
    }

    // setLoading(false);
  }

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
      activeSoapType.current = null;
      soapConsumedOnRinse.current = false;
      activeSoapMultiplier.current = 1;
    }
  }, [currentRoom]);

  const roomConfig = ROOM_THEMES[currentRoom];
  const activeBed = getBedItem(activeBedId);
  const bathroomProgressPercent = isSoapedUp
    ? bubbles.length <= RINSE_COMPLETE_THRESHOLD
      ? 100
      : (1 - (bubbles.length / MAX_BUBBLES)) * 100
    : (bubbles.length / MAX_BUBBLES) * 100;
  const isRinseComplete = isSoapedUp && bubbles.length <= RINSE_COMPLETE_THRESHOLD;

  const handleStartGame = (gameId: string) => {
    handlePlay(gameId);
  };

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM || !isBallMoving || isDraggingBall || !petRef.current) return;

    const rect = petRef.current.getBoundingClientRect();
    const padding = 36;
    const isBallNearPet =
      ballPos.x >= rect.left - padding &&
      ballPos.x <= rect.right + padding &&
      ballPos.y >= rect.top - padding &&
      ballPos.y <= rect.bottom + padding;

    if (!isBallNearPet) return;

    const now = Date.now();
    if (now - lastBallPlayTime.current < 900) return;

    lastBallPlayTime.current = now;
    setIsPlaying(true);
    setStats(prev => ({
      ...prev,
      happiness: Math.min(100, prev.happiness + 2),
    }));
    addXP(2);

    if (ballPlayTimer.current) clearTimeout(ballPlayTimer.current);
    ballPlayTimer.current = setTimeout(() => {
      setIsPlaying(false);
      ballPlayTimer.current = null;
    }, 700);
  }, [addXP, ballPos.x, ballPos.y, currentRoom, isBallMoving, isDraggingBall, setIsPlaying, setStats]);

  useEffect(() => {
    return () => {
      if (ballPlayTimer.current) clearTimeout(ballPlayTimer.current);
    };
  }, []);

  useEffect(() => {
    if (currentRoom !== RoomType.PLAYROOM) {
      cancelAnimationFrame(outsidePetRaf.current);
      setOutsidePetPose('idle');
      return;
    }

    const tick = () => {
      const area = playAreaRef.current;
      if (!area) {
        outsidePetRaf.current = requestAnimationFrame(tick);
        return;
      }

      const rect = area.getBoundingClientRect();
      const current = outsidePetPosRef.current;
      const petWidth = 192 * OUTSIDE_PET_SCALE;
      const petHeight = 208 * OUTSIDE_PET_SCALE;
      const latestBallPos = ballPosRef.current;
      const ballSpeed = Math.hypot(ballVel.current.vx, ballVel.current.vy);
      const ballIsReleasedAndMoving = isBallMovingRef.current && !isDraggingBallRef.current && ballSpeed > 0.5;
      const hasReleasedBallTarget = !!outsideBallTargetRef.current || ballIsReleasedAndMoving;
      const chaseTarget = hasReleasedBallTarget ? latestBallPos : null;

      if (Date.now() < outsideWakeUntilRef.current) {
        setOutsidePetPose('idle');
        outsidePetRaf.current = requestAnimationFrame(tick);
        return;
      }

      if (!chaseTarget || isDraggingBallRef.current) {
        setOutsidePetPose('idle');
        outsidePetRaf.current = requestAnimationFrame(tick);
        return;
      }

      const target = {
        x: chaseTarget.x - rect.left,
        y: chaseTarget.y - rect.top,
      };
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      const shouldChase = distance > 75;

      if (shouldChase) {
        const speed = Math.min(7, Math.max(2, distance * 0.045));
        const next = {
          x: clamp(current.x + (dx / distance) * speed, petWidth / 2, rect.width - petWidth / 2),
          y: clamp(current.y + (dy / distance) * speed, petHeight / 2, rect.height - petHeight / 2),
        };

        outsidePetPosRef.current = next;
        setOutsidePetPos(next);
        setOutsidePetPose(dx < 0 ? 'run-left' : 'run-right');
      } else if (ballIsReleasedAndMoving) {
        setOutsidePetPose(dx < 0 ? 'run-left' : 'run-right');
      } else {
        outsideBallTargetRef.current = null;
        setOutsidePetPose('idle');
      }

      outsidePetRaf.current = requestAnimationFrame(tick);
    };

    outsidePetRaf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(outsidePetRaf.current);
  }, [currentRoom]);

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
      <LevelIndicator stats={stats} />
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
            ${isRinseComplete ? 'ring-green-400' : ''}    
          `}>

            <div
              className={`h-full transition-all duration-300 ease-out relative
                ${!isSoapedUp ? 'bg-gradient-to-r from-pink-300 to-purple-400' : ''}
                ${isSoapedUp && bubbles.length === MAX_BUBBLES ? 'bg-cyan-400 animate-pulse' : ''}
                ${isSoapedUp && bubbles.length < MAX_BUBBLES ? 'bg-gradient-to-r from-blue-400 to-cyan-500' : ''}
              `}
              style={{
                width: `${bathroomProgressPercent}%`
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>
        </div>
      )}

      {/* The Pet */}
      <div ref={playAreaRef} className="flex-1 flex items-center justify-center relative w-full">
        {currentRoom === RoomType.PLAYROOM ? (
          <div
            className="absolute z-20"
            style={{
              left: outsidePetPos.x,
              top: outsidePetPos.y,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <Pet
              ref={petRef}
              stats={stats}
              isSleeping={isSleeping}
              isEating={isEating}
              isPlaying={false}
              isHoveredWithFood={false}
              bubbles={[]}
              lookAt={isBallMoving ? ballPos : null}
              displayScale={OUTSIDE_PET_SCALE}
              showDirtyEffects={false}
              sleepLabelClassName="-top-4 -right-2"
              spriteSheetUrl={activePet.spriteSheetUrl}
              mouthPosition={activePet.mouthPosition}
              idleFrames={activePet.idleFrames}
              idleDuration={activePet.idleDuration}
              sleepInFrames={activePet.sleepInFrames}
              sleepHoldFrame={activePet.sleepHoldFrame}
              clickRow={activePet.clickRow}
              clickFrames={activePet.clickFrames}
              clickDuration={activePet.clickDuration}
              pose={outsidePetPose}
              onClick={handlePetClick}
            />
          </div>
        ) : currentRoom === RoomType.BEDROOM ? (
          <div className="relative flex h-[430px] w-[min(92vw,560px)] items-center justify-center">
            {activeBed && (
              <img
                src={activeBed.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute -bottom-32 left-1/2 z-0 w-[min(85vw,550px)] -translate-x-1/2 select-none drop-shadow-2xl"
              />
            )}
            <div className="relative z-10">
              <Pet
                ref={petRef}
                stats={stats}
                isSleeping={isSleeping}
                isEating={isEating}
                isPlaying={isPlaying}
                isHoveredWithFood={isHoveringPet && !!draggedItem}
                bubbles={bubbles}
                lookAt={pointerState.isDown ? { x: pointerState.x, y: pointerState.y } : null}
                sleepVisualOffsetY={72}
                sleepLabelClassName="top-24 right-14"
                spriteSheetUrl={activePet.spriteSheetUrl}
                mouthPosition={activePet.mouthPosition}
                idleFrames={activePet.idleFrames}
                idleDuration={activePet.idleDuration}
                sleepInFrames={activePet.sleepInFrames}
                sleepHoldFrame={activePet.sleepHoldFrame}
                clickRow={activePet.clickRow}
                clickFrames={activePet.clickFrames}
                clickDuration={activePet.clickDuration}
                onClick={handlePetClick}
              />
            </div>
          </div>
        ) : (
          <Pet
            ref={petRef}
            stats={stats}
            isSleeping={isSleeping}
            isEating={isEating}
            isPlaying={isPlaying}
            isHoveredWithFood={isHoveringPet && !!draggedItem}
            bubbles={bubbles}
            lookAt={pointerState.isDown ? { x: pointerState.x, y: pointerState.y } : null}
            spriteSheetUrl={activePet.spriteSheetUrl}
            mouthPosition={activePet.mouthPosition}
            idleFrames={activePet.idleFrames}
            idleDuration={activePet.idleDuration}
            sleepInFrames={activePet.sleepInFrames}
            sleepHoldFrame={activePet.sleepHoldFrame}
            clickRow={activePet.clickRow}
            clickFrames={activePet.clickFrames}
            clickDuration={activePet.clickDuration}
            onClick={handlePetClick}
          />
        )}

        {/* Room Specific Decor */}
        {currentRoom === RoomType.BATHROOM && (
          <div className="absolute bottom-10 right-10 opacity-50 text-6xl animate-float">🦆</div>
        )}
        {currentRoom === RoomType.BATHROOM && isPoopVisible && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={handlePoopClick}
            className="absolute left-1/2 top-1/2 z-40 translate-x-[140px] translate-y-[110px] rounded-2xl p-2 transition-transform duration-200 hover:scale-110 active:scale-95"
            aria-label="Collect poop for 5 coins"
            title="+5 coins"
          >
            <img
              src="/images/poop.png"
              alt=""
              draggable={false}
              className="h-[80px] w-[80px] object-contain drop-shadow-xl"
            />
          </button>
        )}
        {currentRoom === RoomType.BATHROOM && showPoopReward && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-50 translate-x-[150px] translate-y-[78px]">
            <div className="animate-poop-reward rounded-full bg-amber-400 px-3 py-1.5 text-[14px] font-black tracking-wider text-white">
              +5 coins
            </div>
          </div>
        )}
        {currentRoom === RoomType.GAMES && (
          // Icon removed as requested
          null
        )}

        {/* Playroom Store Button */}
        {false && currentRoom === RoomType.PLAYROOM && (
          <button
            onClick={() => undefined}
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
          items={foodItems}
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
        onOpenShop={() => setShowShopModal(true)}
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
        items={foodItems}
        inventory={inventory}
        activeBedId={activeBedId}
        activeBallId={activeBallId}
        coins={stats.coins}
        currentLevel={stats.level}
        onBuy={(item) => buyItem(item.id, item.price * currencyRate)}
        onBuyBed={(bed) => {
          if (buyItem(bed.id, bed.price * currencyRate)) {
            setActiveBedId(bed.id);
          }
        }}
        onSelectBed={(id) => setActiveBedId(id)}
        onBuyToy={(item) => {
          const toy = TOY_ITEMS.find((candidate) =>
            candidate.id === item.id ||
            candidate.label.toLowerCase() === item.label.toLowerCase() ||
            candidate.label.toLowerCase().replace(/\s+/g, '_') === item.id.toLowerCase()
          );
          const toyId = toy?.id || item.id;
          if ((inventory[toyId] || inventory[item.id] || 0) > 0) {
            setActiveBallId(toyId);
            return;
          }
          if (buyItem(toyId, item.price * currencyRate)) {
            setActiveBallId(toyId);
          }
        }}
        onSelectToy={(id) => setActiveBallId(id)}
        isLoading={isFoodLoading}
      />

    </div>
  );
};
