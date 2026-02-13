
export enum RoomType {
  BEDROOM = 'BEDROOM',
  KITCHEN = 'KITCHEN',
  BATHROOM = 'BATHROOM',
  PLAYROOM = 'PLAYROOM',
  GARDEN = 'GARDEN',
  GAMES = 'GAMES'
}

export enum PetColor {
  POTATO = '#E8C39E',
  PINK = '#FDA4BA',
  BLUE = '#A0C4FF',
  GREEN = '#B9FBC0',
  PURPLE = '#E2C2FF',
  ORANGE = '#FFC8A2'
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
  color: PetColor;
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

export type ToolType = 'soap' | 'shower';