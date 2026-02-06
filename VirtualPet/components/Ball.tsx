import React from 'react';

interface BallProps {
    position: { x: number; y: number };
    isDragging: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
}

const Ball: React.FC<BallProps> = ({ position, isDragging, onPointerDown }) => {
    return (
        <div 
          onPointerDown={onPointerDown}
          className="absolute w-[60px] h-[60px] rounded-full shadow-2xl cursor-grab active:cursor-grabbing border-2 border-white/50 touch-none z-50"
          style={{
              left: position.x,
              top: position.y,
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle at 30% 30%, #ff6b6b, #c92a2a)',
              transition: isDragging ? 'none' : 'transform 0.1s linear'
          }}
        >
            {/* Ball pattern */}
            <div className="absolute inset-0 rounded-full border-4 border-white/20"></div>
            <div className="absolute top-2 left-2 w-4 h-4 bg-white/40 rounded-full blur-sm"></div>
        </div>
    );
};

export default Ball;