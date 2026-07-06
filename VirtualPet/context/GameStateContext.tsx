import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { PetStats, RoomType, FoodItem } from '../types';
import { BED_ITEMS, INITIAL_STATS, XP_TO_LEVEL_UP, INITIAL_INVENTORY, FOOD_ITEMS, TOY_ITEMS } from '../constants';
import { supabase } from '../../lib/supabaseClient';
import { DEFAULT_PET_ID, normalizePetId } from '../petOptions';

type SoapInventory = Record<'soap' | 'soap2', number>;
const TOY_ITEM_IDS = TOY_ITEMS.map((toy) => toy.id);
const ACTIVE_BED_KEY = 'pet_active_bed';
const ACTIVE_BED_DEFAULT_MIGRATION_KEY = 'pet_active_bed_default_none_v1';
const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const PET_ADOPTION_CONFIRMED_KEY = 'pet_adoption_confirmed';
const DEFAULT_CURRENCY_CODE = 'USD';

const normalizeCurrencyCode = (currency?: string | null) => {
    const normalized = (currency || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY_CODE;
};

const createStarterStats = (): PetStats => ({ ...INITIAL_STATS });
const createStarterInventory = (): Record<string, number> => ({});

const clearPetLocalStorage = () => {
    [
        'pet_stats',
        'pet_name',
        'pet_inventory',
        'pet_last_saved_at',
        'pet_active_ball',
        ACTIVE_BED_KEY,
        ACTIVE_BED_DEFAULT_MIGRATION_KEY,
        PET_SLEEPING_KEY,
        PET_SLEEPING_UPDATED_AT_KEY,
        PET_ADOPTION_CONFIRMED_KEY,
        'virtual_pet_bathroom_soap_inventory'
    ].forEach((key) => localStorage.removeItem(key));
};

interface GameStateContextType {
    stats: PetStats;
    setStats: React.Dispatch<React.SetStateAction<PetStats>>;
    petName: string;
    setPetName: (name: string) => void;
    hasAdoptedPet: boolean;
    isPetAdoptionReady: boolean;
    adoptPet: (name: string) => Promise<boolean>;
    currentRoom: RoomType;
    setCurrentRoom: (room: RoomType) => void;
    isSleeping: boolean;
    setIsSleeping: (is: boolean) => void;
    isEating: boolean;
    setIsEating: (is: boolean) => void;
    isPlaying: boolean;
    setIsPlaying: (is: boolean) => void;
    inventory: Record<string, number>;
    soapInventory: SoapInventory;
    setSoapInventory: React.Dispatch<React.SetStateAction<SoapInventory>>;
    buyItem: (itemId: string, price: number) => boolean;
    consumeItem: (itemId: string) => void;
    addXP: (amount: number) => void;
    activeBallId: string;
    setActiveBallId: (id: string) => void;
    activeBedId: string | null;
    setActiveBedId: (id: string | null) => void;
    foodItems: FoodItem[];
    isFoodLoading: boolean;
    currencyCode: string;
    currencyRate: number;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

export const GameStateProvider: React.FC<{ children: React.ReactNode; currencyCode?: string }> = ({ children, currencyCode: initialCurrencyCode = DEFAULT_CURRENCY_CODE }) => {
    const [userId, setUserId] = useState<string | null>(null);
    const [stats, setStats] = useState<PetStats>(INITIAL_STATS);
    const [petName, _setPetName] = useState(DEFAULT_PET_ID);
    const [hasAdoptedPet, setHasAdoptedPet] = useState(false);
    const [isPetAdoptionReady, setIsPetAdoptionReady] = useState(false);
    const setPetName = (name: string) => {
        if (!hasAdoptedPet) _setPetName(normalizePetId(name));
    };
    const [currentRoom, setCurrentRoom] = useState<RoomType>(RoomType.KITCHEN);
    const [inventory, setInventory] = useState<Record<string, number>>(INITIAL_INVENTORY);
    const [soapInventory, setSoapInventory] = useState<SoapInventory>({ soap: 0, soap2: 0 });
    const [isSleeping, setIsSleeping] = useState(() => {
        try {
            return localStorage.getItem(PET_SLEEPING_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [isEating, setIsEating] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeBallId, setActiveBallId] = useState<string>('ball_red');
    const [activeBedId, setActiveBedId] = useState<string | null>(null);
    const [foodItems, setFoodItems] = useState<FoodItem[]>(FOOD_ITEMS);
    const [isFoodLoading, setIsFoodLoading] = useState(true);
    const [currencyCode, setCurrencyCode] = useState(() => normalizeCurrencyCode(initialCurrencyCode));
    const [currencyRate, setCurrencyRate] = useState(1);

    const isHydrated = useRef(false);
    const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Fetch shop items from Supabase
    useEffect(() => {
        const fetchFoodItems = async () => {
            setIsFoodLoading(true);
            try {
                const { data, error } = await supabase
                    .from('aiboard_pricing_items')
                    .select('item_id, name, emoji, category_id, base_price_usd, hunger, happiness, hygiene, energy_gain, image_src, unlock_level')
                    .order('unlock_level', { ascending: true });

                if (data && !error && data.length > 0) {
                    const mapped: FoodItem[] = data.map(row => ({
                        id: row.item_id,
                        icon: row.emoji || '🍽️',
                        label: row.name,
                        hunger: row.hunger ?? 10,
                        happiness: row.happiness ?? 0,
                        hygiene: row.hygiene ?? 0,
                        energyGain: row.energy_gain ?? 0,
                        imageSrc: row.image_src || undefined,
                        xp: Math.max(1, Math.round(Math.max(row.hunger ?? 0, row.happiness ?? 0, row.hygiene ?? 0, row.energy_gain ?? 0, 2) / 2)),
                        price: parseFloat(row.base_price_usd) || 0,
                        category: row.category_id
                            ? row.category_id.charAt(0).toUpperCase() + row.category_id.slice(1)
                            : 'Other',
                        levelReq: row.unlock_level ?? 1,
                    }));
                    setFoodItems(mapped);
                }
            } catch (err) {
                console.error('Failed to load shop items:', err);
            } finally {
                setIsFoodLoading(false);
            }
        };

        fetchFoodItems();
    }, []);

    // Fetch currency rate from Supabase when currencyCode changes
    useEffect(() => {
        const fetchRate = async () => {
            const requestedCurrency = normalizeCurrencyCode(initialCurrencyCode);
            if (requestedCurrency === DEFAULT_CURRENCY_CODE) {
                setCurrencyCode(DEFAULT_CURRENCY_CODE);
                setCurrencyRate(1);
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('aiboard_pricing_currencies')
                    .select('currency_code, rate')
                    .ilike('currency_code', requestedCurrency)
                    .maybeSingle();

                if (data && !error) {
                    setCurrencyCode(normalizeCurrencyCode(data.currency_code));
                    setCurrencyRate(Number(data.rate) || 1);
                    console.log(`[Currency] ${data.currency_code} rate: ${data.rate}`);
                } else {
                    // Fallback to USD if not found
                    setCurrencyCode(DEFAULT_CURRENCY_CODE);
                    setCurrencyRate(1);
                }
            } catch (err) {
                console.warn('[Currency] Failed to fetch rate:', err);
                setCurrencyCode(DEFAULT_CURRENCY_CODE);
                setCurrencyRate(1);
            }
        };
        fetchRate();
    }, [initialCurrencyCode]);

    // Initial Auth & Data Load - Modified for SuperApp
    useEffect(() => {
        const init = async () => {
            let currentUserId: string | null = null;
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session?.user) {
                    currentUserId = sessionData.session.user.id;
                    setUserId(currentUserId);
                }
            } catch (err) {
                console.error("Auth error", err);
            }

            // Load from localStorage as fallback
            const savedStats = localStorage.getItem('pet_stats');
            const savedName = localStorage.getItem('pet_name');
            const savedPetAdoptionConfirmed = localStorage.getItem(PET_ADOPTION_CONFIRMED_KEY) === 'true';
            const savedInv = localStorage.getItem('pet_inventory');
            const savedLastSavedAt = localStorage.getItem('pet_last_saved_at');
            const savedSleeping = localStorage.getItem(PET_SLEEPING_KEY);
            const savedSleepingUpdatedAt = localStorage.getItem(PET_SLEEPING_UPDATED_AT_KEY);

            let loadedStats: PetStats | null = savedStats ? JSON.parse(savedStats) : null;

            // Apply offline decay based on elapsed time since last save
            if (loadedStats && savedLastSavedAt) {
                const elapsedMs = Date.now() - new Date(savedLastSavedAt).getTime();
                const elapsedSecs = Math.max(0, elapsedMs / 1000);
                // Decay rates per second (matching the live game loop: per 5s tick rates)
                loadedStats = {
                    ...loadedStats,
                    hunger:    Math.max(0, loadedStats.hunger    - 0.01  * elapsedSecs),
                    energy:    Math.max(0, loadedStats.energy    - 0.005 * elapsedSecs),
                    hygiene:   Math.max(0, loadedStats.hygiene   - 0.004 * elapsedSecs),
                    happiness: Math.max(0, loadedStats.happiness - 0.006 * elapsedSecs),
                };
                console.log(`[VirtualPet] Applied ${Math.round(elapsedSecs)}s of offline decay`);
            }

            if (loadedStats) setStats(loadedStats);
            if (savedSleeping !== null) setIsSleeping(savedSleeping === 'true');
            if (savedName && savedPetAdoptionConfirmed) {
                const adoptedPet = normalizePetId(savedName);
                _setPetName(adoptedPet);
                setHasAdoptedPet(true);
            }
            const savedBall = localStorage.getItem('pet_active_ball');
            if (savedBall) setActiveBallId(savedBall);
            const savedBed = localStorage.getItem(ACTIVE_BED_KEY);
            const hasMigratedDefaultBed = localStorage.getItem(ACTIVE_BED_DEFAULT_MIGRATION_KEY) === 'true';
            if (savedBed === 'bed_grey' && !hasMigratedDefaultBed) {
                localStorage.removeItem(ACTIVE_BED_KEY);
                localStorage.setItem(ACTIVE_BED_DEFAULT_MIGRATION_KEY, 'true');
            } else {
                if (savedBed) setActiveBedId(savedBed);
                if (!hasMigratedDefaultBed) {
                    localStorage.setItem(ACTIVE_BED_DEFAULT_MIGRATION_KEY, 'true');
                }
            }
            if (savedInv) setInventory(JSON.parse(savedInv));
            localStorage.removeItem('virtual_pet_bathroom_soap_inventory');

            // Load from Supabase if logged in (overriding localStorage)
            if (currentUserId) {
                try {
                    let shouldLoadPetInventory = false;
                    const { data: petData, error: petErr } = await supabase
                        .from('inventory_pet')
                        .select('*')
                        .eq('user_id', currentUserId)
                        .maybeSingle();

                    if (!petData && !petErr) {
                        const starterStats = createStarterStats();
                        const starterInventory = createStarterInventory();
                        clearPetLocalStorage();
                        setStats(starterStats);
                        setInventory(starterInventory);
                        setSoapInventory({ soap: 0, soap2: 0 });
                        setActiveBallId('ball_red');
                        setActiveBedId(null);
                        setIsSleeping(false);
                        _setPetName(DEFAULT_PET_ID);
                        setHasAdoptedPet(false);
                        localStorage.setItem('pet_stats', JSON.stringify(starterStats));
                        localStorage.setItem('pet_inventory', JSON.stringify(starterInventory));
                        localStorage.setItem('pet_last_saved_at', new Date().toISOString());
                    }

                    if (petData && !petErr) {
                        // Apply offline decay using Supabase updated_at timestamp
                        const savedAt = petData.updated_at ? new Date(petData.updated_at).getTime() : null;
                        const elapsedSecs = savedAt ? Math.max(0, (Date.now() - savedAt) / 1000) : 0;

                        const baseStats = {
                            hunger: petData.hunger ?? INITIAL_STATS.hunger,
                            energy: petData.energy ?? INITIAL_STATS.energy,
                            happiness: petData.happiness ?? INITIAL_STATS.happiness,
                            hygiene: petData.hygiene ?? INITIAL_STATS.hygiene,
                            level: petData.level ?? INITIAL_STATS.level,
                            xp: petData.xp ?? INITIAL_STATS.xp,
                            coins: petData.coins ?? INITIAL_STATS.coins
                        };

                        const decayedStats: PetStats = elapsedSecs > 0 ? {
                            ...baseStats,
                            hunger:    Math.max(0, baseStats.hunger    - 0.01  * elapsedSecs),
                            energy:    Math.max(0, baseStats.energy    - 0.005 * elapsedSecs),
                            hygiene:   Math.max(0, baseStats.hygiene   - 0.004 * elapsedSecs),
                            happiness: Math.max(0, baseStats.happiness - 0.006 * elapsedSecs),
                        } : baseStats;

                        if (elapsedSecs > 0) {
                            console.log(`[VirtualPet] Applied ${Math.round(elapsedSecs)}s of offline decay (Supabase)`);
                        }

                        const localSleepUpdatedAt = savedSleepingUpdatedAt
                            ? new Date(savedSleepingUpdatedAt).getTime()
                            : 0;
                        const remoteUpdatedAt = petData.updated_at
                            ? new Date(petData.updated_at).getTime()
                            : 0;
                        const shouldUseLocalSleep =
                            savedSleeping !== null &&
                            localSleepUpdatedAt > 0 &&
                            localSleepUpdatedAt >= remoteUpdatedAt;

                        setStats(decayedStats);
                        if (petData.pet_name) {
                            const adoptedPet = normalizePetId(petData.pet_name);
                            _setPetName(adoptedPet);
                            setHasAdoptedPet(true);
                            localStorage.setItem('pet_name', adoptedPet);
                            localStorage.setItem(PET_ADOPTION_CONFIRMED_KEY, 'true');
                            shouldLoadPetInventory = true;
                            setIsSleeping(shouldUseLocalSleep ? savedSleeping === 'true' : !!petData.is_sleeping);
                            if (petData.active_ball_id) setActiveBallId(petData.active_ball_id);
                            setActiveBedId(petData.active_bed_id || null);
                        } else {
                            const starterStats = createStarterStats();
                            const starterInventory = createStarterInventory();
                            clearPetLocalStorage();
                            setStats(starterStats);
                            setInventory(starterInventory);
                            setSoapInventory({ soap: 0, soap2: 0 });
                            setActiveBallId('ball_red');
                            setActiveBedId(null);
                            _setPetName(DEFAULT_PET_ID);
                            setHasAdoptedPet(false);
                            localStorage.setItem('pet_stats', JSON.stringify(starterStats));
                            localStorage.setItem('pet_inventory', JSON.stringify(starterInventory));
                            localStorage.setItem('pet_last_saved_at', new Date().toISOString());
                        }
                    }

                    if (shouldLoadPetInventory) {
                        const { data: invData, error: invErr } = await supabase
                            .from('pet_inventory')
                            .select('item_id, quantity')
                            .eq('user_id', currentUserId);

                        const newInv: Record<string, number> = {};
                        if (invData && !invErr) {
                            invData.forEach(row => {
                                if (row.item_id === 'soap' || row.item_id === 'soap2') return;
                                if (TOY_ITEM_IDS.includes(row.item_id)) {
                                    newInv[row.item_id] = row.quantity > 0 ? 1 : 0;
                                } else {
                                    newInv[row.item_id] = row.quantity;
                                }
                            });
                        } else if (invErr) {
                            console.error('Failed to load pet inventory', invErr);
                        }
                        setInventory(newInv);
                    }
                } catch (err) {
                    console.error("Failed to load from supabase", err);
                }
            }
            
            setIsPetAdoptionReady(true);
            isHydrated.current = true;
        };

        init();
    }, []);

    // Sync to Supabase / LocalStorage
    useEffect(() => {
        if (!isHydrated.current) return;

        if (saveTimeout.current) clearTimeout(saveTimeout.current);

        saveTimeout.current = setTimeout(async () => {
            localStorage.setItem('pet_stats', JSON.stringify(stats));
            if (hasAdoptedPet) {
                localStorage.setItem('pet_name', petName);
                localStorage.setItem(PET_ADOPTION_CONFIRMED_KEY, 'true');
            } else {
                localStorage.removeItem('pet_name');
                localStorage.removeItem(PET_ADOPTION_CONFIRMED_KEY);
            }
            localStorage.setItem('pet_active_ball', activeBallId);
            if (activeBedId) {
                localStorage.setItem(ACTIVE_BED_KEY, activeBedId);
            } else {
                localStorage.removeItem(ACTIVE_BED_KEY);
            }
            localStorage.setItem('pet_inventory', JSON.stringify(inventory));
            localStorage.setItem(PET_SLEEPING_KEY, String(isSleeping));
            localStorage.setItem('pet_last_saved_at', new Date().toISOString());

            if (userId) {
                try {
                    await supabase.from('inventory_pet').upsert({
                        user_id: userId,
                        pet_name: hasAdoptedPet ? petName : null,
                        hunger: stats.hunger,
                        energy: stats.energy,
                        happiness: stats.happiness,
                        hygiene: stats.hygiene,
                        level: stats.level,
                        xp: stats.xp,
                        coins: stats.coins,
                        is_sleeping: isSleeping,
                        active_ball_id: activeBallId,
                        active_bed_id: activeBedId,
                        updated_at: new Date().toISOString()
                    });

                    // Fast full sync for pet_inventory: delete all & re-insert
                    await supabase.from('pet_inventory').delete().eq('user_id', userId);
                    
                    const combinedInventory: Record<string, number> = inventory;

                    const invRows = Object.entries(combinedInventory)
                        .filter(([, qty]) => qty > 0)
                        .map(([itemId, qty]) => ({
                        user_id: userId,
                        item_id: itemId,
                        quantity: TOY_ITEM_IDS.includes(itemId) ? 1 : qty
                    }));

                    if (invRows.length > 0) {
                        await supabase.from('pet_inventory').insert(invRows);
                    }
                } catch (e) {
                    console.error("Failed to sync to Supabase", e);
                }
            }
        }, 2000); // 2 second debounce

        return () => {
            if (saveTimeout.current) clearTimeout(saveTimeout.current);
        };
    }, [stats, petName, hasAdoptedPet, inventory, isSleeping, activeBallId, activeBedId, userId]);

    useEffect(() => {
        if (!isHydrated.current) return;

        localStorage.setItem(PET_SLEEPING_KEY, String(isSleeping));
        localStorage.setItem(PET_SLEEPING_UPDATED_AT_KEY, new Date().toISOString());
        window.dispatchEvent(new CustomEvent('virtual-pet-sleep-change', { detail: isSleeping }));
    }, [isSleeping]);

    useEffect(() => {
        if (!isHydrated.current) return;

        const activePetId = normalizePetId(petName);
        if (hasAdoptedPet) {
            localStorage.setItem('pet_name', activePetId);
            localStorage.setItem(PET_ADOPTION_CONFIRMED_KEY, 'true');
        }
        window.dispatchEvent(new CustomEvent('virtual-pet-selection-change', { detail: activePetId }));
    }, [petName, hasAdoptedPet]);

    // Game Loop (Stats decay)
    useEffect(() => {
        const timer = setInterval(() => {
            setStats(prev => {
                if (isSleeping) {
                    const activeBed = foodItems.find(item => item.id === activeBedId && item.category === 'Beds');
                    const fallbackBed = BED_ITEMS.find(bed => bed.id === activeBedId);
                    return {
                        ...prev,
                        energy: Math.min(100, prev.energy + (activeBed?.energyGain || fallbackBed?.energyGain || 1)),
                        hunger: Math.max(0, prev.hunger - 0.2),
                        hygiene: Math.max(0, prev.hygiene - 0.1)
                    };
                } else {
                    return {
                        ...prev,
                        hunger: Math.max(0, prev.hunger - 0.05),
                        energy: Math.max(0, prev.energy - 0.025),
                        hygiene: Math.max(0, prev.hygiene - 0.02),
                        happiness: Math.max(0, prev.happiness - 0.03)
                    };
                }
            });
        }, 5000); // Slower decay for background sync

        return () => clearInterval(timer);
    }, [isSleeping, activeBedId, foodItems]);

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

    const adoptPet = async (name: string) => {
        if (hasAdoptedPet) return false;

        const adoptedPet = normalizePetId(name);
        const starterStats = createStarterStats();
        const starterInventory = createStarterInventory();
        const savedAt = new Date().toISOString();

        try {
            if (userId) {
                const { error } = await supabase.from('inventory_pet').upsert({
                    user_id: userId,
                    pet_name: adoptedPet,
                    hunger: starterStats.hunger,
                    energy: starterStats.energy,
                    happiness: starterStats.happiness,
                    hygiene: starterStats.hygiene,
                    level: starterStats.level,
                    xp: starterStats.xp,
                    coins: starterStats.coins,
                    is_sleeping: false,
                    active_ball_id: 'ball_red',
                    active_bed_id: null,
                    updated_at: savedAt
                });

                if (error) throw error;

                const { error: inventoryError } = await supabase
                    .from('pet_inventory')
                    .delete()
                    .eq('user_id', userId);

                if (inventoryError) throw inventoryError;
            }

            clearPetLocalStorage();
            setStats(starterStats);
            setInventory(starterInventory);
            setSoapInventory({ soap: 0, soap2: 0 });
            setActiveBallId('ball_red');
            setActiveBedId(null);
            setIsSleeping(false);
            _setPetName(adoptedPet);
            setHasAdoptedPet(true);
            localStorage.setItem('pet_name', adoptedPet);
            localStorage.setItem(PET_ADOPTION_CONFIRMED_KEY, 'true');
            localStorage.setItem('pet_stats', JSON.stringify(starterStats));
            localStorage.setItem('pet_inventory', JSON.stringify(starterInventory));
            localStorage.setItem('pet_last_saved_at', savedAt);
            localStorage.setItem('pet_active_ball', 'ball_red');
            localStorage.setItem(PET_SLEEPING_KEY, 'false');
            localStorage.setItem(PET_SLEEPING_UPDATED_AT_KEY, savedAt);
            window.dispatchEvent(new CustomEvent('virtual-pet-selection-change', { detail: adoptedPet }));
            return true;
        } catch (err) {
            console.error('Failed to adopt pet', err);
            return false;
        }
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
            hasAdoptedPet,
            isPetAdoptionReady,
            adoptPet,
            currentRoom, setCurrentRoom,
            isSleeping, setIsSleeping,
            isEating, setIsEating,
            isPlaying, setIsPlaying,
            inventory,
            soapInventory,
            setSoapInventory,
            buyItem,
            consumeItem,
            addXP,
            activeBallId,
            setActiveBallId,
            activeBedId,
            setActiveBedId,
            foodItems,
            isFoodLoading,
            currencyCode,
            currencyRate,
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
