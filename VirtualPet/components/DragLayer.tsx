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

const DragLayer: React.FC<DragLayerProps> = ({ draggedItem, draggedTool, dragPos, bubbles, isHoveringPet, isSoapedUp }) => {
    if (!draggedItem && !draggedTool) return null;

    return (
        <>
            {draggedItem && (
                <div 
                    className="fixed pointer-events-none z-50 text-6xl filter drop-shadow-2xl"
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
                    <div className="text-6xl relative">
                        {draggedTool === 'soap' ? '🧼' : '🚿'}
                        
                        {/* Water Spray Effect for Shower - Only shows if we are in 'rinsing mode' (fully soaped) AND hovering */}
                        {draggedTool === 'shower' && bubbles.length > 0 && isHoveringPet && isSoapedUp && (
                            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-16 h-40 pointer-events-none overflow-hidden">
                                {/* Generate rain drops */}
                                {[...Array(6)].map((_, i) => (
                                    <div 
                                    key={i}
                                    className="absolute w-1.5 h-3 bg-blue-400 rounded-full animate-rain opacity-70"
                                    style={{
                                        left: `${20 + (i * 12)}%`,
                                        animationDelay: `${Math.random() * 0.5}s`,
                                        animationDuration: `${0.4 + Math.random() * 0.2}s`
                                    }}
                                    />
                                ))}
                                {[...Array(5)].map((_, i) => (
                                    <div 
                                    key={`b-${i}`}
                                    className="absolute w-1 h-2 bg-blue-300 rounded-full animate-rain opacity-50"
                                    style={{
                                        left: `${15 + (i * 18)}%`,
                                        animationDelay: `${Math.random() * 0.5}s`,
                                        animationDuration: `${0.3 + Math.random() * 0.2}s`
                                    }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default DragLayer;