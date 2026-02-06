import React, { useMemo, forwardRef, useState, useEffect, useRef } from 'react';
import { PetColor, PetStats, Bubble } from '../types';

interface PetProps {
  color: PetColor;
  stats: PetStats;
  isSleeping: boolean;
  isEating: boolean;
  isPlaying: boolean;
  isHoveredWithFood?: boolean;
  bubbles?: Bubble[];
  lookAt?: { x: number; y: number } | null;
  onClick: () => void;
}

const Pet = forwardRef<HTMLDivElement, PetProps>(({
  color,
  stats,
  isSleeping,
  isEating,
  isPlaying,
  isHoveredWithFood,
  bubbles = [],
  lookAt,
  onClick
}, ref) => {

  const internalRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isYawning, setIsYawning] = useState(false);

  useEffect(() => {
    if (!ref) return;
    if (typeof ref === 'function') {
      ref(internalRef.current);
    } else {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = internalRef.current;
    }
  }, [ref]);

  useEffect(() => {
    const updateRect = () => {
      if (internalRef.current) {
        setRect(internalRef.current.getBoundingClientRect());
      }
    };

    updateRect();
    const resizeObserver = new ResizeObserver(() => updateRect());
    if (internalRef.current) {
      resizeObserver.observe(internalRef.current);
    }
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, []);

  useEffect(() => {
    if (stats.energy > 30 || isSleeping || isEating || isPlaying) {
      setIsYawning(false);
      return;
    }

    const intervalTime = 8000;
    const interval = setInterval(() => {
      setIsYawning(true);
      setTimeout(() => setIsYawning(false), 2000);
    }, intervalTime);

    const initialTimeout = setTimeout(() => {
      setIsYawning(true);
      setTimeout(() => setIsYawning(false), 2000);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialTimeout);
    };
  }, [stats.energy, isSleeping, isEating, isPlaying]);

  // --- MOVED UP: Determine eye state first ---
  const getEyeState = () => {
    if (isSleeping) return 'closed';
    if (isYawning) return 'closed';
    if (isEating) return 'wide';
    if (isHoveredWithFood) return 'wide';
    if (stats.energy < 30) return 'droopy';
    if (isPlaying) return 'happy';
    if (bubbles.length > 5) return 'closed';
    return 'normal';
  };

  const eyeState = getEyeState();

  // --- NEW: Calculate base Y position based on tiredness ---
  // Normal: 95, Droopy: 100 (5px lower)
  const baseEyeY = eyeState === 'droopy' ? 97 : 95;

  const pupilOffsets = useMemo(() => {
    if (!lookAt || !rect) {
      return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    }

    const getOffset = (eyeCx: number, eyeCy: number) => {
      const scaleX = 200 / rect.width;
      const scaleY = 200 / rect.height;

      const mouseSvgX = (lookAt.x - rect.left) * scaleX;
      const mouseSvgY = (lookAt.y - rect.top) * scaleY;

      const dx = mouseSvgX - eyeCx;
      const dy = mouseSvgY - eyeCy;

      const maxOffset = 8;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) return { x: 0, y: 0 };

      const cappedDist = Math.min(dist, maxOffset);
      const angle = Math.atan2(dy, dx);

      return {
        x: Math.cos(angle) * cappedDist,
        y: Math.sin(angle) * cappedDist
      };
    };

    // Use dynamic baseEyeY here
    return {
      left: getOffset(75, baseEyeY),
      right: getOffset(125, baseEyeY)
    };

  }, [lookAt, rect, baseEyeY]); // Added baseEyeY dependency

  const getMouthState = () => {
    if (isYawning) return 'yawn';
    if (isEating) return 'chewing';
    if (isHoveredWithFood) return 'open';
    if (stats.happiness < 40 || stats.hunger < 30) return 'sad';
    if (isPlaying) return 'smile_open';
    if (bubbles.length > 5) return 'smile_open';
    return 'smile';
  };

  const mouthState = getMouthState();
  const isDirty = stats.hygiene < 60;
  const isVeryDirty = stats.hygiene < 30;

  const animationClass = useMemo(() => {
    if (isSleeping) return 'animate-breathe scale-95 opacity-90';
    if (isEating) return 'animate-breathe';
    if (isPlaying) return 'animate-bounce-custom';
    if (isHoveredWithFood) return 'animate-breathe scale-105';
    return 'animate-breathe';
  }, [isSleeping, isEating, isPlaying, isHoveredWithFood]);

  const useCenteredBase = !!lookAt;

  // Update base positions to use the new Y coordinate
  const leftEyeBase = { cx: 75, cy: baseEyeY };
  const rightEyeBase = { cx: 125, cy: baseEyeY };

  const bodyPath = "M 35 25 L 70 55 Q 100 60 130 55 L 165 25 Q 195 80 190 150 Q 185 195 100 195 Q 15 195 10 150 Q 5 80 35 25 Z";

  return (
    <div
      ref={internalRef}
      className="relative w-64 h-64 cursor-pointer select-none"
      onClick={onClick}
    >
      <div className={`w-full h-full transition-transform duration-300 ${animationClass}`}>
        <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl overflow-visible">

          <defs>
            <clipPath id="pet-body-clip">
              <path d={bodyPath} />
            </clipPath>

            <clipPath id="droopy-eye-clip">
              <rect x="0" y="95" width="200" height="105" />
            </clipPath>

            <linearGradient id="mud-gradient" x1="0" x2="0" y1="0.5" y2="1">
              <stop offset="0%" stopColor="#5D4037" stopOpacity="0" />
              <stop offset="100%" stopColor="#3E2723" stopOpacity="0.6" />
            </linearGradient>
          </defs>

          {/* Tail */}
          <path
            d="M 160 160 Q 210 160 195 110"
            fill="none"
            stroke={color}
            strokeWidth="16"
            strokeLinecap="round"
            className="animate-tail origin-bottom-right"
            filter="brightness(0.9)"
          />

          {/* Body */}
          <path
            d={bodyPath}
            fill={color}
            stroke="rgba(0,0,0,0.1)"
            strokeWidth="4"
          />

          {/* Ears */}
          <path d="M 45 40 L 65 60 L 45 75 Z" fill="rgba(255,255,255,0.3)" />
          <path d="M 155 40 L 135 60 L 155 75 Z" fill="rgba(255,255,255,0.3)" />
          <ellipse cx="100" cy="150" rx="40" ry="30" fill="rgba(255,255,255,0.15)" />
          <ellipse cx="60" cy="70" rx="10" ry="5" fill="rgba(255,255,255,0.3)" transform="rotate(-45 60 70)" />

          {/* Dirt Layer */}
          {isDirty && (
            <g clipPath="url(#pet-body-clip)">
              <rect x="0" y="100" width="200" height="100" fill="url(#mud-gradient)" />
              <g fill="#5D4037" opacity="0.5">
                <circle cx="40" cy="140" r="8" />
                <circle cx="160" cy="150" r="12" />
                <circle cx="100" cy="180" r="10" />
                <circle cx="120" cy="140" r="3" opacity="0.8" />
                <circle cx="80" cy="160" r="4" opacity="0.8" />
              </g>
              <g fill="#5D4037" opacity="0.3" filter="blur(1px)">
                <ellipse cx="60" cy="110" rx="10" ry="6" transform="rotate(-15 60 110)" />
                <ellipse cx="140" cy="100" rx="8" ry="8" />
              </g>
            </g>
          )}

          {/* Face Group */}
          <g transform="translate(0, 5)">
            {/* Whiskers */}
            <g stroke="#333" strokeWidth="2" opacity="0.3" strokeLinecap="round">
              <path d="M 40 115 L 10 110" />
              <path d="M 40 125 L 10 130" />
              <path d="M 160 115 L 190 110" />
              <path d="M 160 125 L 190 130" />
            </g>

            {/* Eyes */}
            {eyeState === 'closed' ? (
              <>
                <path d="M 60 95 Q 75 105 90 95" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
                <path d="M 110 95 Q 125 105 140 95" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
              </>
            ) : eyeState === 'happy' ? (
              <>
                <path d="M 60 95 Q 75 85 90 95" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
                <path d="M 110 95 Q 125 85 140 95" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
              </>
            ) : (
              <>
                {/* Dark Circles (Bags) for Droopy Eyes */}
                {eyeState === 'droopy' && (
                  <>
                    <ellipse cx="75" cy="105" rx="16" ry="8" fill="#3E2723" opacity="0.2" />
                    <ellipse cx="125" cy="105" rx="16" ry="8" fill="#3E2723" opacity="0.2" />
                  </>
                )}

                {/* Left Eye Group */}
                <g clipPath={eyeState === 'droopy' ? "url(#droopy-eye-clip)" : undefined}>
                  <circle cx="75" cy="95" r="15" fill="white" stroke="#333" strokeWidth="2" />
                  <circle
                    cx={leftEyeBase.cx}
                    cy={leftEyeBase.cy}
                    r="6"
                    fill="#333"
                    className="will-change-transform"
                    style={{ transform: `translate(${pupilOffsets.left.x}px, ${pupilOffsets.left.y}px)` }}
                  />
                </g>

                {/* Right Eye Group */}
                <g clipPath={eyeState === 'droopy' ? "url(#droopy-eye-clip)" : undefined}>
                  <circle cx="125" cy="95" r="15" fill="white" stroke="#333" strokeWidth="2" />
                  <circle
                    cx={rightEyeBase.cx}
                    cy={rightEyeBase.cy}
                    r="6"
                    fill="#333"
                    className="will-change-transform"
                    style={{ transform: `translate(${pupilOffsets.right.x}px, ${pupilOffsets.right.y}px)` }}
                  />
                </g>

                {/* Droopy Eyelid Lines */}
                {eyeState === 'droopy' && (
                  <>
                    <line x1="60" y1="95" x2="90" y2="95" stroke="#333" strokeWidth="2" strokeLinecap="round" />
                    <line x1="110" y1="95" x2="140" y2="95" stroke="#333" strokeWidth="2" strokeLinecap="round" />
                  </>
                )}
              </>
            )}

            {/* Nose */}
            <ellipse cx="100" cy="115" rx="7" ry="5" fill="#FFA4A4" />

            {/* Mouth */}
            <g transform="translate(0, 3)">
              {mouthState === 'chewing' ? (
                <ellipse cx="100" cy="128" rx="10" ry="6" fill="#552200" className="animate-chew" />
              ) : mouthState === 'yawn' ? (
                <g>
                  <ellipse cx="100" cy="128" rx="12" ry="16" fill="#3E2723" />
                  <path d="M 94 138 Q 100 130 106 138 Q 106 142 100 144 Q 94 142 94 138" fill="#EF9A9A" />
                </g>
              ) : mouthState === 'open' ? (
                <circle cx="100" cy="128" r="10" fill="#552200" />
              ) : mouthState === 'smile' ? (
                <>
                  <path d="M 100 115 Q 85 130 70 122" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
                  <path d="M 100 115 Q 115 130 130 122" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
                </>
              ) : mouthState === 'smile_open' ? (
                <path d="M 85 125 Q 100 145 115 125 Z" fill="#552200" stroke="none" />
              ) : (
                <>
                  <path d="M 100 115 Q 85 135 70 130" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
                  <path d="M 100 115 Q 115 135 130 130" fill="none" stroke="#333" strokeWidth="3" strokeLinecap="round" />
                </>
              )}
            </g>
          </g>

          {/* Very Dirty Layer */}
          {isVeryDirty && (
            <g>
              {/* Stink Lines Group (Your S-shape design) */}
              <g stroke="#558B2F" strokeWidth="3" strokeLinecap="round" fill="none">

                {/* Left Stink Line */}
                <g transform="translate(45, 30)">
                  <path d="M 0 0 Q 10 -15 0 -30 T 0 -60">
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      from="0 0"
                      to="0 -20"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 1; 0"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </path>
                </g>

                {/* Middle Stink Line */}
                <g transform="translate(100, 10)">
                  <path d="M 0 0 Q -10 -15 0 -30 T 0 -60">
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      from="0 0"
                      to="0 -25"
                      dur="2.5s"
                      begin="0.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 1; 0"
                      dur="2.5s"
                      begin="0.5s"
                      repeatCount="indefinite"
                    />
                  </path>
                </g>

                {/* Right Stink Line */}
                <g transform="translate(155, 30)">
                  <path d="M 0 0 Q 10 -15 0 -30 T 0 -60">
                    <animateTransform
                      attributeName="transform"
                      type="translate"
                      from="0 0"
                      to="0 -20"
                      dur="2.2s"
                      begin="1s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0; 1; 0"
                      dur="2.2s"
                      begin="1s"
                      repeatCount="indefinite"
                    />
                  </path>
                </g>
              </g>

              {/* IMPROVED FLIES (Buzzing + Orientation) */}
              <g>
                {/* Fly 1 */}
                <g>
                  {/* Fly Graphic Container */}
                  <g transform="rotate(90)"> {/* Initial rotation correction if needed, or rely on auto */}
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
                  {/* Motion Path with Rotation */}
                  <animateMotion
                    path="M 40 40 C 20 20, 60 0, 40 40"
                    dur="2s"
                    repeatCount="indefinite"
                    rotate="auto"
                  />
                </g>

                {/* Fly 2 */}
                <g>
                  {/* Fly Graphic Container */}
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
                  {/* Motion Path with Rotation */}
                  <animateMotion
                    path="M 160 50 C 180 30, 140 10, 160 50"
                    dur="1.5s"
                    repeatCount="indefinite"
                    rotate="auto"
                  />
                </g>
              </g>
            </g>
          )}
          {/* BUBBLES LAYER */}
          {/* 1. Wrap in a group with clipPath="url(#pet-body-clip)" */}
          <g clipPath="url(#pet-body-clip)">
            {bubbles.map((bubble) => (
              <circle
                key={bubble.id}
                cx={bubble.x}
                cy={bubble.y}
                // 2. Multiplied size by 0.7 to make individual bubbles smaller
                r={bubble.size * 0.7}
                fill="white"
                opacity="0.8"
                stroke="rgba(200, 230, 255, 0.5)"
                strokeWidth="1"
              />
            ))}
          </g>
        </svg>
      </div>

      {isSleeping && (
        <div className="absolute -top-10 right-0 animate-float text-4xl font-bold text-slate-400">
          Zzz...
        </div>
      )}
    </div>
  );
});

Pet.displayName = "Pet";

export default Pet;