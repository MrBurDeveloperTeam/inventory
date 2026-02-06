import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PetStats, PetColor, RoomType } from '../types';
import { INITIAL_STATS, XP_TO_LEVEL_UP, INITIAL_INVENTORY } from '../constants';
import { supabase } from '../../supabaseClient';

interface GameStateContextType {
    stats: PetStats;
    setStats: React.Dispatch<React.SetStateAction<PetStats>>;
    petName: string;
    setPetName: (name: string) => void;
    petColor: PetColor;
    setPetColor: (color: PetColor) => void;
    currentRoom: RoomType;
    setCurrentRoom: (room: RoomType) => void;
    isSleeping: boolean;
    setIsSleeping: (is: boolean) => void;
    isEating: boolean;
    setIsEating: (is: boolean) => void;
    isPlaying: boolean;
    setIsPlaying: (is: boolean) => void;
    inventory: Record<string, number>;
    buyItem: (itemId: string, price: number) => boolean;
    consumeItem: (itemId: string) => void;
    addXP: (amount: number) => void;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

export const GameStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [stats, setStats] = useState<PetStats>(INITIAL_STATS);
    const [petName, setPetName] = useState("Molar");
    const [petColor, setPetColor] = useState<PetColor>(PetColor.POTATO);
    const [currentRoom, setCurrentRoom] = useState<RoomType>(RoomType.KITCHEN);
    const [inventory, setInventory] = useState<Record<string, number>>(INITIAL_INVENTORY);
    const [isSleeping, setIsSleeping] = useState(false);
    const [isEating, setIsEating] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const isHydrated = useRef(false);
    const saveTimeout = useRef<NodeJS.Timeout | null>(null);

    // Initial Auth & Data Load
    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserId = session?.user?.id || null;
            setUserId(currentUserId);

            if (currentUserId) {
                // Try to load from Supabase
                const { data, error } = await supabase
                    .from('inventory_pet')
                    .select('*')
                    .eq('user_id', currentUserId)
                    .single();

                if (data && !error) {
                    setStats({
                        hunger: Number(data.hunger),
                        energy: Number(data.energy),
                        happiness: Number(data.happiness),
                        hygiene: Number(data.hygiene),
                        level: data.level,
                        xp: data.xp,
                        coins: data.coins
                    });
                    setPetName(data.pet_name);
                    setPetColor(data.pet_color as PetColor);
                    setIsSleeping(data.is_sleeping);
                }

                // Load inventory from pet_inventory table
                const { data: invData, error: invError } = await supabase
                    .from('pet_inventory')
                    .select('item_id, quantity')
                    .eq('user_id', currentUserId);

                if (invData && !invError) {
                    const invMap = invData.reduce((acc, curr) => ({
                        ...acc,
                        [curr.item_id]: curr.quantity
                    }), {});
                    setInventory(invMap);
                }
            } else {
                // Load from localStorage fallback
                const savedStats = localStorage.getItem('pet_stats');
                const savedName = localStorage.getItem('pet_name');
                const savedColor = localStorage.getItem('pet_color');
                const savedInv = localStorage.getItem('pet_inventory');

                if (savedStats) setStats(JSON.parse(savedStats));
                if (savedName) setPetName(savedName);
                if (savedColor) setPetColor(savedColor as PetColor);
                if (savedInv) setInventory(JSON.parse(savedInv));
            }
            isHydrated.current = true;
        };

        init();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setUserId(session?.user?.id || null);
            isHydrated.current = false; // Trigger re-load for new user
            init();
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    // Sync to Supabase / LocalStorage
    useEffect(() => {
        if (!isHydrated.current) return;

        if (saveTimeout.current) clearTimeout(saveTimeout.current);

        saveTimeout.current = setTimeout(async () => {
            if (userId) {
                await supabase.from('inventory_pet').upsert({
                    user_id: userId,
                    pet_name: petName,
                    pet_color: petColor,
                    hunger: stats.hunger,
                    energy: stats.energy,
                    happiness: stats.happiness,
                    hygiene: stats.hygiene,
                    level: stats.level,
                    xp: stats.xp,
                    coins: stats.coins,
                    is_sleeping: isSleeping,
                    last_interaction: new Date().toISOString()
                });

                // Sync inventory table
                const inventoryEntries = Object.entries(inventory).map(([itemId, qty]) => ({
                    user_id: userId,
                    item_id: itemId,
                    quantity: qty
                }));

                if (inventoryEntries.length > 0) {
                    await supabase.from('pet_inventory').upsert(inventoryEntries);
                }

                // Remove items from DB that are no longer in state
                const currentItemIds = Object.keys(inventory);
                if (currentItemIds.length > 0) {
                    await supabase.from('pet_inventory')
                        .delete()
                        .eq('user_id', userId)
                        .not('item_id', 'in', `(${currentItemIds.join(',')})`);
                } else {
                    await supabase.from('pet_inventory')
                        .delete()
                        .eq('user_id', userId);
                }
            } else {
                localStorage.setItem('pet_stats', JSON.stringify(stats));
                localStorage.setItem('pet_name', petName);
                localStorage.setItem('pet_color', petColor);
                localStorage.setItem('pet_inventory', JSON.stringify(inventory));
            }
        }, 2000); // 2 second debounce

        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [stats, petName, petColor, inventory, isSleeping, userId]);

    // Game Loop (Stats decay)
    useEffect(() => {
        const timer = setInterval(() => {
            setStats(prev => {
                if (isSleeping) {
                    return {
                        ...prev,
                        energy: Math.min(100, prev.energy + 2),
                        hunger: Math.max(0, prev.hunger - 0.2),
                        hygiene: Math.max(0, prev.hygiene - 0.1)
                    };
                } else {
                    return {
                        ...prev,
                        hunger: Math.max(0, prev.hunger - 0.4),
                        energy: Math.max(0, prev.energy - 0.2),
                        hygiene: Math.max(0, prev.hygiene - 0.15),
                        happiness: Math.max(0, prev.happiness - 0.25)
                    };
                }
            });
        }, 5000); // Slower decay for background sync

        return () => clearInterval(timer);
    }, [isSleeping]);

    const addXP = (amount: number) => {
        setStats(prev => {
            let newXP = prev.xp + amount;
            let newLevel = prev.level;
            let newCoins = prev.coins;
            if (newXP >= XP_TO_LEVEL_UP) {
                newXP -= XP_TO_LEVEL_UP;
                newLevel += 1;
                newCoins = (prev.coins || 0) + 50;
                return {
                    ...prev,
                    level: newLevel,
                    xp: newXP,
                    happiness: 100,
                    energy: 100,
                    coins: newCoins
                };
            }
            return { ...prev, xp: newXP, level: newLevel };
        });
    };

    const buyItem = (itemId: string, price: number) => {
        if (stats.coins >= price) {
            setStats(prev => ({ ...prev, coins: prev.coins - price }));
            setInventory(prev => ({
                ...prev,
                [itemId]: (prev[itemId] || 0) + 1
            }));
            return true;
        }
        return false;
    };

    const consumeItem = (itemId: string) => {
        setInventory(prev => {
            const current = prev[itemId] || 0;
            if (current <= 1) {
                const newState = { ...prev };
                delete newState[itemId];
                return newState;
            }
            return { ...prev, [itemId]: current - 1 };
        });
    };

    return (
        <GameStateContext.Provider value={{
            stats, setStats,
            petName, setPetName,
            petColor, setPetColor,
            currentRoom, setCurrentRoom,
            isSleeping, setIsSleeping,
            isEating, setIsEating,
            isPlaying, setIsPlaying,
            inventory,
            buyItem,
            consumeItem,
            addXP
        }}>
            {children}
        </GameStateContext.Provider>
    );
};

export const useGameState = () => {
    const context = useContext(GameStateContext);
    if (context === undefined) {
        throw new Error('useGameState must be used within a GameStateProvider');
    }
    return context;
};
