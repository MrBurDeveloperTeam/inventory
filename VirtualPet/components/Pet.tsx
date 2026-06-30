import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { PetStats, Bubble } from '../types';

export type PetPose = 'idle' | 'run-left' | 'run-right';

interface PetProps {
  stats: PetStats;
  isSleeping: boolean;
  isEating: boolean;
  isPlaying: boolean;
  isHoveredWithFood?: boolean;
  bubbles?: Bubble[];
  lookAt?: { x: number; y: number } | null;
  displayScale?: number;
  showDirtyEffects?: boolean;
  sleepVisualOffsetY?: number;
  sleepLabelClassName?: string;
  spriteSheetUrl?: string;
  mouthPosition?: {
    left: string;
    top: string;
  };
  idleFrames?: number;
  idleDuration?: string;
  sleepInFrames?: number[];
  sleepHoldFrame?: number;
  clickRow?: number;
  clickFrames?: number;
  clickDuration?: string;
  pose?: PetPose;
  onClick: () => void;
}

const DEFAULT_SPRITESHEET_URL = '/images/mallow-spritesheet.webp';
const FRAME_WIDTH = 192;
const FRAME_HEIGHT = 208;
const SHEET_COLUMNS = 8;
const SHEET_ROWS = 9;
const DISPLAY_SCALE = 1.5;
const SLEEP_ROW = 5;
const SLEEP_FRAME_MS = 180;
const DEFAULT_SLEEP_IN_FRAMES = [1, 2, 3, 4];
const DEFAULT_SLEEP_HOLD_FRAME = 4;
const CLICK_REACTION_MS = 720;
const parseDurationMs = (duration: string, fallbackMs: number) => {
  const value = Number.parseFloat(duration);
  if (!Number.isFinite(value)) return fallbackMs;
  return duration.trim().endsWith('ms') ? value : value * 1000;
};

const SPRITES = {
  idle: { row: 0, frames: 6, duration: '1.1s' },
  'run-right': { row: 1, frames: 8, duration: '0.72s' },
  'run-left': { row: 2, frames: 8, duration: '0.72s' },
  click: { row: 3, frames: 4, duration: '0.72s' },
} as const;

const toBubblePercent = (value: number) => Math.max(0, Math.min(100, value / 2));
const BUBBLE_AREA_LEFT = 18;
const BUBBLE_AREA_WIDTH = 64;

const Pet = forwardRef<HTMLDivElement, PetProps>(({
  stats,
  isSleeping,
  isEating,
  isPlaying,
  isHoveredWithFood,
  bubbles = [],
  lookAt,
  displayScale = DISPLAY_SCALE,
  showDirtyEffects = true,
  sleepVisualOffsetY = 0,
  sleepLabelClassName = 'top-4 right-14',
  spriteSheetUrl = DEFAULT_SPRITESHEET_URL,
  mouthPosition = { left: '46%', top: '46.5%' },
  idleFrames = SPRITES.idle.frames,
  idleDuration = SPRITES.idle.duration,
  sleepInFrames = DEFAULT_SLEEP_IN_FRAMES,
  sleepHoldFrame = DEFAULT_SLEEP_HOLD_FRAME,
  clickRow = SPRITES.click.row,
  clickFrames = SPRITES.click.frames,
  clickDuration = SPRITES.click.duration,
  pose = 'idle',
  onClick
}, ref) => {
  const [sleepFrame, setSleepFrame] = useState<number | null>(isSleeping ? sleepHoldFrame : null);
  const [isClickReacting, setIsClickReacting] = useState(false);
  const previousSleepingRef = useRef(isSleeping);
  const sleepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clickSprite = useMemo(() => ({
    row: clickRow,
    frames: clickFrames,
    duration: clickDuration,
  }), [clickDuration, clickFrames, clickRow]);
  const idleSprite = useMemo(() => ({
    ...SPRITES.idle,
    frames: idleFrames,
    duration: idleDuration,
  }), [idleDuration, idleFrames]);

  const sprite = useMemo(() => {
    if (isClickReacting && !isSleeping && sleepFrame === null) return clickSprite;
    if (pose === 'idle') return idleSprite;
    return SPRITES[pose] || idleSprite;
  }, [clickSprite, idleSprite, isClickReacting, isSleeping, pose, sleepFrame]);

  useEffect(() => {
    sleepTimersRef.current.forEach(clearTimeout);
    sleepTimersRef.current = [];

    if (previousSleepingRef.current === isSleeping) {
      setSleepFrame(isSleeping ? sleepHoldFrame : null);
      return;
    }

    previousSleepingRef.current = isSleeping;
    const frames = isSleeping ? sleepInFrames : [...sleepInFrames].reverse();
    frames.forEach((frame, index) => {
      sleepTimersRef.current.push(
        setTimeout(() => setSleepFrame(frame), index * SLEEP_FRAME_MS)
      );
    });

    if (!isSleeping) {
      sleepTimersRef.current.push(
        setTimeout(() => setSleepFrame(null), frames.length * SLEEP_FRAME_MS)
      );
    }

    return () => {
      sleepTimersRef.current.forEach(clearTimeout);
      sleepTimersRef.current = [];
    };
  }, [isSleeping, sleepHoldFrame, sleepInFrames]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (!isSleeping && sleepFrame === null) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      setIsClickReacting(false);
      window.setTimeout(() => setIsClickReacting(true), 0);
      const reactionMs = parseDurationMs(clickDuration, CLICK_REACTION_MS) + 40;
      clickTimerRef.current = setTimeout(() => {
        setIsClickReacting(false);
        clickTimerRef.current = null;
      }, reactionMs);
    }
    onClick();
  };

  const isDirty = stats.hygiene < 60;
  const isVeryDirty = stats.hygiene < 30;
  const showOpenMouth = isEating || !!isHoveredWithFood;
  const showChewingEffect = isEating;
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const lookOffsetX = lookAt ? Math.max(-8, Math.min(8, (lookAt.x - viewportWidth / 2) / 80)) : 0;
  const lookOffsetY = lookAt ? Math.max(-5, Math.min(5, (lookAt.y - viewportHeight / 2) / 120)) : 0;
  const isSleepVisual = sleepFrame !== null || isSleeping;
  const sleepProgress = sleepFrame !== null
    ? Math.max(0, Math.min(1, sleepFrame / Math.max(1, sleepHoldFrame)))
    : isSleeping
      ? 1
      : 0;
  const sleepOffsetY = sleepVisualOffsetY * sleepProgress;
  const filter = 'none';
  const motionScale = isSleepVisual ? 0.95 : isHoveredWithFood ? 1.05 : 1;
  const spriteBackgroundPosition = sleepFrame !== null
    ? `-${sleepFrame * FRAME_WIDTH}px -${SLEEP_ROW * FRAME_HEIGHT}px`
    : `0 -${sprite.row * FRAME_HEIGHT}px`;
  const isClickSprite = isClickReacting && !isSleeping && sleepFrame === null;
  const clickFrameDistance = FRAME_WIDTH * Math.max(0, sprite.frames - 1);
  const spriteAnimation = sleepFrame !== null
    ? 'none'
    : isClickSprite
      ? `mallow-vpet-click ${sprite.duration} steps(${sprite.frames - 1}, end) 1 forwards`
      : `mallow-vpet-sprite ${sprite.duration} steps(${sprite.frames}) infinite`;

  return (
    <div
      ref={ref}
      className="relative cursor-pointer select-none"
      style={{
        width: FRAME_WIDTH * displayScale,
        height: FRAME_HEIGHT * displayScale,
      }}
      onClick={handleClick}
    >
      <div
        className={[
          'absolute inset-0 transition-transform duration-300',
          isSleepVisual ? 'opacity-90' : '',
          isSleepVisual ? '' : isPlaying ? 'animate-bounce-custom' : 'animate-breathe',
        ].join(' ')}
        style={{
          transform: `translate(${lookOffsetX}px, ${lookOffsetY + sleepOffsetY}px) scale(${motionScale})`,
        }}
      >
        <div className={`absolute inset-0 ${isSleepVisual ? 'mallow-sleep-breathe-layer' : ''}`}>
          <div
            className="mallow-virtual-pet absolute left-1/2 top-1/2"
            style={{
              width: FRAME_WIDTH,
              height: FRAME_HEIGHT,
              backgroundImage: `url(${spriteSheetUrl})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: spriteBackgroundPosition,
              backgroundSize: `${FRAME_WIDTH * SHEET_COLUMNS}px ${FRAME_HEIGHT * SHEET_ROWS}px`,
              imageRendering: 'pixelated',
              transform: `translate(-50%, -50%) scale(${displayScale})`,
              transformOrigin: 'center',
              filter,
              '--click-frame-distance': `-${clickFrameDistance}px`,
              animation: spriteAnimation,
            } as React.CSSProperties}
          />
        </div>

        <div
          className="absolute left-1/2 bottom-7 -z-10 h-12 w-56 -translate-x-1/2 rounded-full bg-slate-900/10 blur-xl"
          aria-hidden="true"
        />

        {showOpenMouth && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <span
              className={[
                'mallow-chew-mouth absolute -translate-x-1/2',
                showChewingEffect ? 'mallow-chew-mouth-active' : 'mallow-chew-mouth-idle',
              ].join(' ')}
              style={{
                left: mouthPosition.left,
                top: mouthPosition.top,
              }}
            />
          </div>
        )}

        {showDirtyEffects && !isSleepVisual && isVeryDirty && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="mallow-stink-lines absolute left-1/2 top-[-22%] flex -translate-x-1/2 gap-8">
              <svg className="mallow-stink-line" viewBox="0 0 36 86">
                <path d="M 18 80 C 6 64 30 52 18 38 C 6 24 30 16 18 4" />
              </svg>
              <svg className="mallow-stink-line mallow-stink-line-delay-1" viewBox="0 0 36 86">
                <path d="M 18 80 C 30 64 6 52 18 38 C 30 24 6 16 18 4" />
              </svg>
              <svg className="mallow-stink-line mallow-stink-line-delay-2" viewBox="0 0 36 86">
                <path d="M 18 80 C 6 64 30 52 18 38 C 6 24 30 16 18 4" />
              </svg>
            </div>
            <svg className="mallow-fly-layer absolute inset-0" viewBox="0 0 200 140">
              <g>
                <g>
                  <g transform="rotate(90)">
                    <ellipse cx="0" cy="0" rx="3" ry="2" fill="#222" />
                    <g fill="rgba(255,255,255,0.7)">
                      <ellipse cx="-2" cy="-2" rx="3" ry="1.5" transform="rotate(-30)" />
                      <ellipse cx="2" cy="-2" rx="3" ry="1.5" transform="rotate(30)" />
                      <animateTransform
                        attributeName="transform"
                        type="scale"
                        values="1 1; 1 0.2; 1 1"
                        dur="0.05s"
                        repeatCount="indefinite"
                      />
                    </g>
                  </g>
                  <animateMotion
                    path="M 40 40 C 20 20, 60 0, 40 40"
                    dur="2s"
                    repeatCount="indefinite"
                    rotate="auto"
                  />
                </g>

                <g>
                  <g transform="rotate(90)">
                    <ellipse cx="0" cy="0" rx="3" ry="2" fill="#222" />
                    <g fill="rgba(255,255,255,0.7)">
                      <ellipse cx="-2" cy="-2" rx="3" ry="1.5" transform="rotate(-30)" />
                      <ellipse cx="2" cy="-2" rx="3" ry="1.5" transform="rotate(30)" />
                      <animateTransform
                        attributeName="transform"
                        type="scale"
                        values="1 1; 1 0.2; 1 1"
                        dur="0.05s"
                        repeatCount="indefinite"
                      />
                    </g>
                  </g>
                  <animateMotion
                    path="M 160 50 C 180 30, 140 10, 160 50"
                    dur="1.5s"
                    repeatCount="indefinite"
                    rotate="auto"
                  />
                </g>
              </g>
            </svg>
          </div>
        )}

        {bubbles.length > 0 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 overflow-visible"
            style={{
              left: `${BUBBLE_AREA_LEFT}%`,
              width: `${BUBBLE_AREA_WIDTH}%`,
            }}
            aria-hidden="true"
          >
            {bubbles.map((bubble) => (
              <span
                key={bubble.id}
                className="absolute rounded-full border border-cyan-100/80 bg-white/75 shadow-sm"
                style={{
                  left: `${((toBubblePercent(bubble.x) - BUBBLE_AREA_LEFT) / BUBBLE_AREA_WIDTH) * 100}%`,
                  top: `${toBubblePercent(bubble.y)}%`,
                  width: bubble.size * DISPLAY_SCALE * 1.2,
                  height: bubble.size * DISPLAY_SCALE * 1.2,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {isSleeping && (
        <div className={`absolute ${sleepLabelClassName} animate-float text-3xl font-bold text-slate-400`}>
          Zzz...
        </div>
      )}

      <style>{`
        @keyframes mallow-vpet-sprite {
          from {
            background-position-x: 0;
          }
          to {
            background-position-x: -${FRAME_WIDTH * sprite.frames}px;
          }
        }

        @keyframes mallow-vpet-click {
          from {
            background-position-x: 0;
          }
          to {
            background-position-x: var(--click-frame-distance);
          }
        }

        .mallow-chew-mouth {
          width: 28px;
          height: 22px;
          border-radius: 999px;
          background: #3b160b;
          box-shadow: inset 0 -5px 0 rgba(255, 160, 160, 0.7), 0 1px 2px rgba(0, 0, 0, 0.18);
        }

        .mallow-chew-mouth-idle {
          transform: translateX(-50%) scaleY(0.72);
        }

        .mallow-chew-mouth-active {
          animation: mallow-chew-mouth 0.34s ease-in-out infinite;
        }

        @keyframes mallow-chew-mouth {
          0%, 100% {
            transform: translateX(-50%) scaleY(0.72);
          }
          50% {
            transform: translateX(-50%) scaleY(1.05);
          }
        }

        .mallow-sleep-breathe-layer {
          animation: mallow-sleep-breathe 3s ease-in-out infinite;
          transform-origin: center 62%;
        }

        @keyframes mallow-sleep-breathe {
          0%, 100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-2px) scale(1.018);
          }
        }

        .mallow-stink-line {
          width: 30px;
          height: 78px;
          overflow: visible;
          animation: mallow-stink-rise 2.1s ease-in-out infinite;
        }

        .mallow-stink-line path {
          fill: none;
          stroke: rgba(85, 139, 47, 0.7);
          stroke-width: 5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .mallow-stink-line-delay-1 {
          animation-delay: 0.45s;
        }

        .mallow-stink-line-delay-2 {
          animation-delay: 0.9s;
        }

        @keyframes mallow-stink-rise {
          0% {
            opacity: 0;
            transform: translateY(18px) rotate(-8deg);
          }
          40% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(-18px) rotate(8deg);
          }
        }

        .mallow-fly-layer {
          overflow: visible;
        }
      `}</style>
    </div>
  );
});

Pet.displayName = 'Pet';

export default Pet;
