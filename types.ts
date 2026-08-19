export type Category = 'consumables' | 'equipment' | 'instruments' | 'materials' | 'medication' | 'ppe' | 'other';
export type UOM = 'pcs' | 'box' | 'unit' | 'kit';

/** Sentinel room ID used for items whose room was deleted. Never persisted to DB. */
export const TBA_ROOM_ID = '__TBA__';
export const TBA_ROOM_NAME = 'Unassigned (TBA)';

export interface ItemBatch {
  id: string;
  qty: number;
  unitPrice: number;
  expiryDate?: string | null;
}

export interface Item {
  id: string;
  name: string;
  brand: string;
  code: string;
  quantity: number;
  uom: UOM;
  price: number;
  vendor: string;
  category: Category;
  description: string;
  expiryDate?: string | null;
  createdAt?: string;
  batches?: ItemBatch[];
  /** True when the item's room was deleted — shown as TBA until reassigned. */
  tba?: boolean;
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  items: Item[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  roomId: string;
  roomName: string;
  action: 'add' | 'remove' | 'delete' | 'transfer_out' | 'transfer_in' | 'edit' | 'receive' | 'session_end';
  details: string;
  actorId?: string;
  actorName?: string;
  beforeValue?: string;
  afterValue?: string;
}

export interface PurchaseHistory {
  id: string;
  timestamp: string;
  productName: string;
  brand: string;
  code: string;
  vendor: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  location: string;
  category: string;
  roomId: string; // Changed to string
  uom?: UOM;
  expiryDate?: string | null;
  description?: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  accountType: 'individual' | 'company' | 'admin';
  phone: string;
  position: string;
  clinicName?: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  companyName?: string;
}

export interface CatPosition {
  x: number;
  y: number;
}

export interface Collaborator {
  id: string;
  owner_id: string;
  user_id: string;
  role: 'viewer' | 'editor' | 'admin';
  created_at: string;
  profile?: UserProfile; // Joined profile data
}

export interface Invitation {
  id: string;
  owner_id: string;
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  token: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
}

export interface ExtractedItem {
  id: string;
  brand?: string;
  product: string;
  sku?: string;
  quantity?: number;
  uom?: string;
  price?: number;
  total?: number;
  vendor?: string;
  category?: string;
  expiryDate?: string;
  purchaseDate?: string;
  description?: string;
}

export type ChatHistory = {
  role: "user" | "model";
  parts: { text: string }[];
};