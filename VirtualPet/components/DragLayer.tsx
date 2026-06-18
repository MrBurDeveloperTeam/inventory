import React from 'react';
import { FoodItem, ToolType, Bubble } from '../types';

interface DragLayerProps {
    draggedItem: FoodItem | null;
    draggedTool: ToolType | null;
    dragPos: { x: number; y: number };
    bubbles: Bubble[];
    isHoveringPet?: boolean;
    isSoapedUp?: boolean;
}

const TOOL_ICONS: Record<ToolType, { src: string; alt: string }> = {
    soap: { src: '/pets/soap.png', alt: 'Soap' },
    soap2: { src: '/pets/soap2.png', alt: 'Premium Soap' },
    shower: { src: '/pets/shower.png', alt: 'Shower' },
};

const SHOWER_DROPLETS = [
    { left: 22, top: 0, width: 2, height: 15, delay: 0, duration: 0.72, drift: -8, opacity: 0.86 },
    { left: 32, top: 3, width: 2, height: 17, delay: 0.05, duration: 0.75, drift: -6, opacity: 0.78 },
    { left: 42, top: 5, width: 2, height: 18, delay: 0.08, duration: 0.78, drift: -4, opacity: 0.8 },
    { left: 52, top: 8, width: 2, height: 20, delay: 0.16, duration: 0.84, drift: 5, opacity: 0.82 },
    { left: 62, top: 10, width: 2, height: 18, delay: 0.2, duration: 0.76, drift: 8, opacity: 0.76 },
    { left: 72, top: 13, width: 2, height: 16, delay: 0.24, duration: 0.7, drift: 11, opacity: 0.7 },
    { left: 28, top: 18, width: 2, height: 19, delay: 0.3, duration: 0.88, drift: -12, opacity: 0.76 },
    { left: 38, top: 22, width: 2, height: 21, delay: 0.36, duration: 0.9, drift: -9, opacity: 0.74 },
    { left: 48, top: 27, width: 2, height: 18, delay: 0.12, duration: 0.76, drift: -3, opacity: 0.7 },
    { left: 58, top: 31, width: 2, height: 20, delay: 0.02, duration: 0.78, drift: 4, opacity: 0.72 },
    { left: 68, top: 35, width: 2, height: 19, delay: 0.1, duration: 0.82, drift: 8, opacity: 0.68 },
    { left: 78, top: 40, width: 2, height: 16, delay: 0.46, duration: 0.82, drift: 11, opacity: 0.62 },
    { left: 25, top: 45, width: 2, height: 14, delay: 0.18, duration: 0.68, drift: -10, opacity: 0.62 },
    { left: 36, top: 50, width: 2, height: 15, delay: 0.54, duration: 0.82, drift: -5, opacity: 0.62 },
    { left: 47, top: 55, width: 2, height: 18, delay: 0.62, duration: 0.86, drift: -2, opacity: 0.58 },
    { left: 58, top: 59, width: 2, height: 20, delay: 0.26, duration: 0.88, drift: 4, opacity: 0.66 },
    { left: 70, top: 64, width: 2, height: 18, delay: 0.2, duration: 0.86, drift: 10, opacity: 0.58 },
    { left: 80, top: 68, width: 2, height: 15, delay: 0.4, duration: 0.72, drift: 13, opacity: 0.52 },
    { left: 30, top: 73, width: 2, height: 17, delay: 0.44, duration: 0.74, drift: -9, opacity: 0.56 },
    { left: 42, top: 78, width: 2, height: 14, delay: 0.34, duration: 0.7, drift: -4, opacity: 0.52 },
    { left: 54, top: 83, width: 2, height: 16, delay: 0.5, duration: 0.78, drift: 2, opacity: 0.5 },
    { left: 66, top: 88, width: 2, height: 16, delay: 0.6, duration: 0.8, drift: 7, opacity: 0.5 },
    { left: 76, top: 93, width: 2, height: 13, delay: 0.14, duration: 0.66, drift: 12, opacity: 0.46 },
];

const DragLayer: React.FC<DragLayerProps> = ({ draggedItem, draggedTool, dragPos, bubbles, isHoveringPet, isSoapedUp }) => {
    if (!draggedItem && !draggedTool) return null;

    return (
        <>
            {draggedItem && (
                <div
                    className="fixed pointer-events-none z-50 text-5xl filter drop-shadow-2xl"
                    style={{
                        left: dragPos.x,
                        top: dragPos.y,
                        transform: 'translate(-50%, -50%) scale(1.2)'
                    }}
                >
                    {draggedItem.icon}
                </div>
            )}

            {draggedTool && (
                <div
                    className="fixed pointer-events-none z-50 filter drop-shadow-2xl"
                    style={{
                        left: dragPos.x,
                        top: dragPos.y,
                        transform: 'translate(-50%, -50%)'
                    }}
                >
                    <div className="relative">
                        <img
                            src={TOOL_ICONS[draggedTool].src}
                            alt={TOOL_ICONS[draggedTool].alt}
                            draggable={false}
                            className="h-24 w-24 object-contain drop-shadow-md select-none"
                        />

                        {draggedTool === 'shower' && bubbles.length > 0 && isHoveringPet && isSoapedUp && (
                            <div className="absolute top-11 left-1/2 h-44 w-28 -translate-x-1/2 pointer-events-none overflow-visible">
                                {SHOWER_DROPLETS.map((drop, i) => (
                                    <span
                                        key={i}
                                        className="shower-droplet absolute rounded-full bg-gradient-to-b from-sky-200 via-blue-400 to-cyan-500 shadow-[0_0_8px_rgba(56,189,248,0.55)]"
                                        style={{
                                            left: `${drop.left}%`,
                                            top: `${drop.top}%`,
                                            width: drop.width,
                                            height: drop.height,
                                            opacity: drop.opacity,
                                            animationDelay: `${drop.delay}s`,
                                            animationDuration: `${drop.duration}s`,
                                            '--drop-drift': `${drop.drift}px`,
                                        } as React.CSSProperties}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
            <style>{`
                @keyframes shower-droplet-fall {
                    0% {
                        transform: translate(0, -10px) scaleY(0.75);
                        opacity: 0;
                    }
                    18% {
                        opacity: 1;
                    }
                    100% {
                        transform: translate(var(--drop-drift), 74px) scaleY(1.15);
                        opacity: 0;
                    }
                }

                .shower-droplet {
                    animation-name: shower-droplet-fall;
                    animation-timing-function: cubic-bezier(0.2, 0.65, 0.35, 1);
                    animation-iteration-count: infinite;
                    transform-origin: center top;
                }
            `}</style>
        </>
    );
};

export default DragLayer;
