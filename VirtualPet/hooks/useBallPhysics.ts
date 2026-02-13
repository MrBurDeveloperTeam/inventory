import { useState, useRef, useEffect } from 'react';
import { RoomType } from '../types';

export const useBallPhysics = (currentRoom: RoomType) => {
    const [ballPos, setBallPos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const [isDraggingBall, setIsDraggingBall] = useState(false);
    const [isBallMoving, setIsBallMoving] = useState(false);
    // Physics refs
    const ballVel = useRef({ vx: 0, vy: 0 });
    const lastDragPos = useRef({ x: 0, y: 0, time: 0 });
    const physicsFrameRef = useRef<number>(0);

    // Physics Loop
    useEffect(() => {
        const updateBallPhysics = () => {
            if (currentRoom === RoomType.PLAYROOM) {
                if (isDraggingBall) {
                    setIsBallMoving(true);
                } else {
                    setBallPos(prev => {
                        let { x, y } = prev;
                        let { vx, vy } = ballVel.current;
                        const radius = 30; // Ball radius
                        const floor = window.innerHeight;
                        const walls = window.innerWidth;

                        // Air Resistance
                        vx *= 0.995;
                        vy *= 0.995;

                        // Update position
                        x += vx;
                        y += vy;

                        const bounceFactor = -0.95;

                        // Floor Collision
                        if (y + radius > floor) {
                            y = floor - radius;
                            vy *= bounceFactor;
                        }
                        // Ceiling Collision
                        else if (y - radius < 0) {
                            y = radius;
                            vy *= bounceFactor;
                        }

                        // Wall Collisions
                        if (x + radius > walls) {
                            x = walls - radius;
                            vx *= bounceFactor;
                        } else if (x - radius < 0) {
                            x = radius;
                            vx *= bounceFactor;
                        }

                        ballVel.current = { vx, vy };
                        return { x, y };
                    });

                    // Check if moving based on velocity
                    // Note: This reads velocity from the previous update cycle which is fine for this check
                    const { vx, vy } = ballVel.current;
                    const speed = Math.sqrt(vx * vx + vy * vy);
                    // Threshold for "stopped"
                    setIsBallMoving(speed > 0.5);
                }
            }
            physicsFrameRef.current = requestAnimationFrame(updateBallPhysics);
        };

        if (currentRoom === RoomType.PLAYROOM) {
            physicsFrameRef.current = requestAnimationFrame(updateBallPhysics);
        } else {
            // Reset when leaving/entering
            setBallPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
            ballVel.current = { vx: 0, vy: 0 };
            setIsBallMoving(false);
        }

        return () => cancelAnimationFrame(physicsFrameRef.current);
    }, [currentRoom, isDraggingBall]);

    return {
        ballPos, setBallPos,
        isDraggingBall, setIsDraggingBall,
        isBallMoving,
        ballVel,
        lastDragPos
    };
};