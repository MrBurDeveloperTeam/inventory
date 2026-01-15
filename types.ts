
export type Category = 'consumables' | 'equipment' | 'instruments' | 'materials' | 'medication' | 'ppe' | 'other';
export type UOM = 'pcs' | 'box' | 'unit' | 'kit';

export interface ItemBatch {
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
  batches?: ItemBatch[];
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
  action: 'add' | 'remove' | 'delete' | 'transfer_out' | 'transfer_in' | 'edit' | 'receive';
  details: string;
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
}

export interface UserProfile {
  name: string;
  email: string;
  accountType: 'individual' | 'company' | 'admin';
  phone: string;
  position: string;
  companyName?: string;
  avatarUrl?: string;
  backgroundUrl?: string;
}

export interface CatPosition {
  x: number;
  y: number;
}
