import type { Item, PurchaseHistory } from '../../types';

export const ARCHIVED_LOCATION_LABEL = 'Archived';

export const markRoomPurchaseHistoryArchived = (
  history: PurchaseHistory[],
  roomId: string
): PurchaseHistory[] => history.map(entry => (
  entry.roomId === roomId
    ? { ...entry, roomId: '', location: ARCHIVED_LOCATION_LABEL }
    : entry
));

const normalizeValue = (value?: string | null) => (value || '').trim().toLowerCase();

export const isPurchaseHistoryForItem = (
  entry: PurchaseHistory,
  roomId: string,
  item: Item
) => (
  entry.roomId === roomId &&
  normalizeValue(entry.productName) === normalizeValue(item.name) &&
  normalizeValue(entry.brand) === normalizeValue(item.brand) &&
  normalizeValue(entry.code) === normalizeValue(item.code) &&
  normalizeValue(entry.vendor) === normalizeValue(item.vendor) &&
  normalizeValue(entry.category) === normalizeValue(item.category) &&
  normalizeValue(entry.uom) === normalizeValue(item.uom) &&
  Number(entry.unitPrice) === Number(item.price) &&
  normalizeValue(entry.expiryDate) === normalizeValue(item.expiryDate)
);

export const markItemPurchaseHistoryArchived = (
  history: PurchaseHistory[],
  roomId: string,
  item: Item
): PurchaseHistory[] => history.map(entry => (
  isPurchaseHistoryForItem(entry, roomId, item)
    ? { ...entry, roomId: '', location: ARCHIVED_LOCATION_LABEL }
    : entry
));

export const getPurchaseHistoryLocation = (
  entry: PurchaseHistory,
  currentRoomName?: string
) => currentRoomName || entry.location || ARCHIVED_LOCATION_LABEL;

export const isArchivedPurchaseHistory = (entry: PurchaseHistory) =>
  entry.location === ARCHIVED_LOCATION_LABEL && !entry.roomId;
