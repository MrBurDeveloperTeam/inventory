
export interface User {
  id: string;
  name: string;
  contactName?: string;
  email: string;
  phone: string;
  type: 'Individual' | 'Company';
  jobPosition: string;
  clinicName: string;
  role: 'Admin' | 'Dentist' | 'Assistant';
  lastActive: string;
  avatarUrl?: string | null;
}

export interface MockClinic {
  id: string;
  name: string;
  owner: string;
  location: string;
  status: 'active' | 'warning' | 'inactive';
  inventoryValue: number;
  lastSync: string;
}

export interface MockGlobalOrder {
  id: string;
  clinic: string;
  vendor: string;
  amount: number;
  status: 'delivered' | 'processing' | 'cancelled';
  date: string;
  timestamp: string;
  category: string;
  productName?: string;
  brand?: string;
  code?: string;
  qty?: number;
  unitPrice?: number;
  uom?: string;
  expiryDate?: string | null;
  userId?: string;
}

export interface MockNotification {
  id: string;
  type: 'critical' | 'info' | 'success' | 'warning';
  category: 'inventory' | 'system' | 'billing' | 'user';
  title: string;
  message: string;
  time: string;
  timestamp: string;
  isRead: boolean;
  clinicName?: string;
}

export interface GlobalInventoryItem {
  id: number;
  brand: string;
  name: string;
  code: string;
  quantity: number;
  uom: string;
  price: number;
  vendor: string;
  category: string;
  expiryDate: string;
  location: string;
  clinic: string;
  userId?: string; // Track who owns the item for user stats
  batches?: {
    qty: number;
    unitPrice: number;
    expiryDate?: string | null;
  }[];
}
