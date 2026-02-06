
import { PetStats, PetColor, RoomType, FoodItem } from './types';

export const INITIAL_STATS: PetStats = {
  hunger: 80,
  energy: 90,
  happiness: 80,
  hygiene: 50,
  level: 1,
  xp: 0,
  coins: 100
};

export const INITIAL_INVENTORY: Record<string, number> = {
  apple: 5,
  cookie: 3
};

export const XP_TO_LEVEL_UP = 100;

export const ROOM_THEMES: Record<RoomType, { bg: string; accent: string; icon: string }> = {
  [RoomType.BEDROOM]: { bg: 'bg-gradient-to-br from-[#FFFCEB] via-[#FFF9C4] to-[#FDE68A]', accent: 'text-amber-600', icon: '🌙' },
  [RoomType.KITCHEN]: { bg: 'bg-gradient-to-br from-[#FFF5E6] via-[#FFE0B2] to-[#FFCC80]', accent: 'text-orange-600', icon: '🍔' },
  [RoomType.BATHROOM]: { bg: 'bg-gradient-to-br from-[#E0F7FA] via-[#B2EBF2] to-[#80DEEA]', accent: 'text-cyan-600', icon: '🧼' },
  [RoomType.PLAYROOM]: { bg: 'bg-gradient-to-br from-[#FDF2F8] via-[#FCE7F3] to-[#F9A8D4]', accent: 'text-pink-600', icon: '🎮' },
  [RoomType.GARDEN]: { bg: 'bg-gradient-to-br from-[#F0FDF4] via-[#DCFCE7] to-[#86EFAC]', accent: 'text-emerald-600', icon: '🌳' },
  [RoomType.GAMES]: { bg: 'bg-gradient-to-br from-[#EEF2FF] via-[#E0E7FF] to-[#C7D2FE]', accent: 'text-indigo-600', icon: '🕹️' },
};

export const COLORS = [
  { value: PetColor.POTATO, label: 'Classic' },
  { value: PetColor.PINK, label: 'Berry' },
  { value: PetColor.BLUE, label: 'Sky' },
  { value: PetColor.GREEN, label: 'Mint' },
  { value: PetColor.PURPLE, label: 'Lavender' },
  { value: PetColor.ORANGE, label: 'Peach' },
];

export const FOOD_ITEMS: FoodItem[] = [
  // Breakfast
  { id: 'toast', icon: '🍞', label: 'Toast', hunger: 10, xp: 5, price: 5, category: 'Breakfast', levelReq: 1 },
  { id: 'egg', icon: '🍳', label: 'Egg', hunger: 15, xp: 5, price: 10, category: 'Breakfast', levelReq: 2 },
  { id: 'cereal', icon: '🥣', label: 'Cereal', hunger: 20, xp: 8, price: 12, category: 'Breakfast', levelReq: 3 },
  { id: 'bacon', icon: '🥓', label: 'Bacon', hunger: 20, xp: 8, price: 15, category: 'Breakfast', levelReq: 4 },
  { id: 'croissant', icon: '🥐', label: 'Croissant', hunger: 15, xp: 8, price: 18, category: 'Breakfast', levelReq: 5 },
  { id: 'waffle', icon: '🧇', label: 'Waffle', hunger: 25, xp: 10, happiness: 5, price: 20, category: 'Breakfast', levelReq: 7 },
  { id: 'pancakes', icon: '🥞', label: 'Pancakes', hunger: 18, xp: 9, happiness: 5, price: 45, category: 'Breakfast', levelReq: 10 },

  // Healthy Options
  { id: 'apple', icon: '🍎', label: 'Apple', hunger: 10, xp: 5, price: 0, category: 'Healthy', levelReq: 1 },
  { id: 'banana', icon: '🍌', label: 'Banana', hunger: 12, xp: 6, price: 5, category: 'Healthy', levelReq: 2 },
  { id: 'carrot', icon: '🥕', label: 'Carrot', hunger: 12, xp: 6, price: 8, category: 'Healthy', levelReq: 3 },
  { id: 'corn', icon: '🌽', label: 'Corn', hunger: 15, xp: 8, price: 10, category: 'Healthy', levelReq: 4 },
  { id: 'strawberry', icon: '🍓', label: 'Berry', hunger: 8, xp: 4, happiness: 5, price: 10, category: 'Healthy', levelReq: 5 },
  { id: 'grapes', icon: '🍇', label: 'Grapes', hunger: 8, xp: 4, happiness: 4, price: 12, category: 'Healthy', levelReq: 6 },
  { id: 'broccoli', icon: '🥦', label: 'Veggie', hunger: 15, xp: 10, price: 15, category: 'Healthy', levelReq: 7 },
  { id: 'watermelon', icon: '🍉', label: 'Melon', hunger: 15, xp: 8, price: 20, category: 'Healthy', levelReq: 8 },
  { id: 'pineapple', icon: '🍍', label: 'Pineapple', hunger: 15, xp: 8, happiness: 5, price: 22, category: 'Healthy', levelReq: 9 },
  { id: 'salad', icon: '🥗', label: 'Salad', hunger: 20, xp: 12, price: 25, category: 'Healthy', levelReq: 12 },

  // Main Meals
  { id: 'sandwich', icon: '🥪', label: 'Sandwich', hunger: 20, xp: 10, price: 20, category: 'Meals', levelReq: 3 },
  { id: 'fries', icon: '🍟', label: 'Fries', hunger: 15, xp: 8, price: 25, category: 'Meals', levelReq: 4 },
  { id: 'hotdog', icon: '🌭', label: 'Hotdog', hunger: 25, xp: 12, price: 30, category: 'Meals', levelReq: 5 },
  { id: 'taco', icon: '🌮', label: 'Taco', hunger: 20, xp: 10, price: 35, category: 'Meals', levelReq: 6 },
  { id: 'spaghetti', icon: '🍝', label: 'Pasta', hunger: 28, xp: 14, price: 40, category: 'Meals', levelReq: 8 },
  { id: 'pizza', icon: '🍕', label: 'Pizza', hunger: 25, xp: 12, price: 45, category: 'Meals', levelReq: 10 },
  { id: 'ramen', icon: '🍜', label: 'Ramen', hunger: 30, xp: 15, price: 45, category: 'Meals', levelReq: 12 },
  { id: 'burger', icon: '🍔', label: 'Burger', hunger: 30, xp: 15, price: 50, category: 'Meals', levelReq: 15 },
  { id: 'burrito', icon: '🌯', label: 'Burrito', hunger: 35, xp: 18, price: 55, category: 'Meals', levelReq: 18 },
  { id: 'chicken', icon: '🍗', label: 'Chicken', hunger: 35, xp: 18, price: 55, category: 'Meals', levelReq: 20 },
  { id: 'sushi', icon: '🍣', label: 'Sushi', hunger: 20, xp: 15, happiness: 5, price: 60, category: 'Meals', levelReq: 25 },
  { id: 'steak', icon: '🥩', label: 'Steak', hunger: 40, xp: 25, price: 80, category: 'Meals', levelReq: 30 },

  // Drinks
  { id: 'water', icon: '💧', label: 'Water', hunger: 5, xp: 2, price: 0, category: 'Drinks', levelReq: 1 },
  { id: 'milk', icon: '🥛', label: 'Milk', hunger: 10, xp: 5, price: 10, category: 'Drinks', levelReq: 2 },
  { id: 'juice', icon: '🧃', label: 'Juice', hunger: 10, xp: 5, happiness: 5, price: 15, category: 'Drinks', levelReq: 3 },
  { id: 'tea', icon: '🍵', label: 'Tea', hunger: 5, xp: 5, energy: 5, price: 15, category: 'Drinks', levelReq: 5 },
  { id: 'soda', icon: '🥤', label: 'Soda', hunger: 10, xp: 5, happiness: 10, energy: 5, price: 20, category: 'Drinks', levelReq: 8 },
  { id: 'coffee', icon: '☕', label: 'Coffee', hunger: 5, xp: 5, energy: 15, price: 25, category: 'Drinks', levelReq: 10 },
  { id: 'boba', icon: '🧋', label: 'Boba', hunger: 15, xp: 8, happiness: 15, price: 30, category: 'Drinks', levelReq: 15 },

  // Sweets
  { id: 'cookie', icon: '🍪', label: 'Cookie', hunger: 8, xp: 5, happiness: 8, price: 0, category: 'Sweets', levelReq: 1 },
  { id: 'lollipop', icon: '🍭', label: 'Lollipop', hunger: 5, xp: 4, happiness: 10, price: 15, category: 'Sweets', levelReq: 3 },
  { id: 'chocolate', icon: '🍫', label: 'Chocolate', hunger: 10, xp: 8, happiness: 12, price: 25, category: 'Sweets', levelReq: 5 },
  { id: 'donut', icon: '🍩', label: 'Donut', hunger: 15, xp: 10, happiness: 10, price: 35, category: 'Sweets', levelReq: 8 },
  { id: 'icecream', icon: '🍦', label: 'Ice Cream', hunger: 10, xp: 8, happiness: 15, price: 40, category: 'Sweets', levelReq: 10 },
  { id: 'pie', icon: '🥧', label: 'Pie', hunger: 25, xp: 12, happiness: 15, price: 50, category: 'Sweets', levelReq: 15 },
  { id: 'cake', icon: '🍰', label: 'Cake', hunger: 20, xp: 15, happiness: 20, price: 70, category: 'Sweets', levelReq: 20 },
];