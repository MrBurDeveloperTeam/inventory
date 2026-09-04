export type Category = 'consumables' | 'equipment' | 'instruments' | 'materials' | 'medication' | 'ppe' | 'other';
export type UOM = 'pcs' | 'box' | 'unit' | 'kit';

// Phase INVENTORY-FAILED-SAVE-RETRY-AND-RECONCILIATION-RECOVERY-HARDENING
// (kept here, not in App.tsx, specifically so components like
// InventoryActionConfirm.tsx can `instanceof`-check it without a
// circular import back into App.tsx). Thrown only after a mutation RPC
// has already confirmed success — it means the stock change IS durably
// saved; only the read-only follow-up reconciliation failed. Callers
// must never treat this the same as a definite mutation failure: never
// re-run the mutation, never claim "not saved".
export class InventoryReconciliationError extends Error {
  committed: true = true;
  constructor(message: string, public cause: unknown) {
    super(message);
    this.name = 'InventoryReconciliationError';
  }
}

// Structured classification of a thrown mutation error, using the
// actual PostgREST/Postgres SQLSTATE (`error.code`) every hardened RPC
// raises with — not message-substring matching. 28000 UNAUTHENTICATED,
// 42501 UNAUTHORIZED, 22023 every INVALID_*/INSUFFICIENT_STOCK
// validation rejection, P0002 every "not found" rejection, 23505
// IDEMPOTENCY_KEY_REUSED. Anything else (no `.code` at all — a
// transport failure never reaches Postgres — or an unrecognized code)
// is deliberately treated as an UNKNOWN/ambiguous outcome, never a
// definite one: a false negative here just costs one wasted idempotent
// retry, while a false positive risks a real double mutation.
const DEFINITE_MUTATION_FAILURE_CODES = new Set(['28000', '42501', '22023', 'P0002', '23505']);
export const isDefiniteMutationFailure = (err: any): boolean =>
  typeof err?.code === 'string' && DEFINITE_MUTATION_FAILURE_CODES.has(err.code);

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
  /**
   * Direct mrbur.shop product page URL (e.g.
   * "https://www.mrbur.shop/shop/801-06-fg-diamond-round-9153"), captured by
   * the Odoo-side snabbb_shop_inventory_sync module at the moment this item
   * was auto-received from a shop purchase. Null/undefined for items never
   * bought through mrbur.shop (manually added, OCR/Excel import, etc).
   */
  shopUrl?: string | null;
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
  action: 'add' | 'remove' | 'delete' | 'transfer_out' | 'transfer_in' | 'edit' | 'receive' | 'session_end' | 'page_view';
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