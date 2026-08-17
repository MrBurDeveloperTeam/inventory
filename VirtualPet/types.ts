
export enum RoomType {
  BEDROOM = 'BEDROOM',
  KITCHEN = 'KITCHEN',
  BATHROOM = 'BATHROOM',
  PLAYROOM = 'PLAYROOM',
  GARDEN = 'GARDEN',
  GAMES = 'GAMES'
}

export interface PetStats {
  hunger: number; // 0-100 (100 is full)
  energy: number; // 0-100 (100 is rested)
  happiness: number; // 0-100 (100 is happy)
  hygiene: number; // 0-100 (100 is clean)
  level: number;
  xp: number;
  coins: number;
}

export interface GameState {
  stats: PetStats;
  name: string;
  isSleeping: boolean;
  lastInteraction: number;
  inventory: Record<string, number>;
}

export interface ChatMessage {
  sender: 'user' | 'pet';
  text: string;
  timestamp: number;
}

export interface FoodItem {
  id: string;
  icon: string;
  label: string;
  hunger: number;
  xp: number;
  price: number;
  energy?: number;
  happiness?: number;
  hygiene?: number;
  energyGain?: number;
  imageSrc?: string;
  category: string;
  levelReq?: number;
}

export interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
}

export interface ToyItem {
  id: string;
  icon: string;
  label: string;
  price: number;
  color: string;
  levelReq?: number;
}

export interface BedItem {
  id: string;
  label: string;
  price: number;
  src: string;
  energyGain: number;
  levelReq?: number;
}

export type ToolType = 'soap' | 'shower';
