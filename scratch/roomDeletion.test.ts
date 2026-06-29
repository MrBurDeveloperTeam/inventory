import assert from 'node:assert/strict';
import { markItemPurchaseHistoryArchived, markRoomPurchaseHistoryArchived } from '../src/utils/roomDeletion';
import type { Item, PurchaseHistory } from '../types';

const history: PurchaseHistory[] = [
  {
    id: 'h-1',
    timestamp: '2026-01-26',
    productName: 'Dental Bur',
    brand: '',
    code: '',
    vendor: '',
    qty: 10,
    unitPrice: 7.99,
    totalPrice: 79.9,
    location: 'Room 1256',
    category: 'Consumables',
    roomId: 'room-1256',
    uom: 'box',
    expiryDate: null
  },
  {
    id: 'h-2',
    timestamp: '2026-01-27',
    productName: 'Gloves',
    brand: '',
    code: '',
    vendor: '',
    qty: 2,
    unitPrice: 5,
    totalPrice: 10,
    location: 'Room 7',
    category: 'PPE',
    roomId: 'room-7',
    uom: 'box',
    expiryDate: null
  }
];

const archived = markRoomPurchaseHistoryArchived(history, 'room-1256');

assert.equal(archived[0].location, 'Archived');
assert.equal(archived[0].roomId, '');
assert.equal(archived[1].location, 'Room 7');
assert.equal(archived[1].roomId, 'room-7');
assert.notEqual(archived[0], history[0]);
assert.equal(archived[1], history[1]);

const deletedItem: Item = {
  id: 'item-78',
  name: 'Dental Bur',
  brand: '',
  code: '',
  quantity: 10,
  uom: 'box',
  price: 7.99,
  vendor: '',
  category: 'consumables',
  description: '',
  expiryDate: null
};

const itemArchived = markItemPurchaseHistoryArchived(history, 'room-1256', deletedItem);

assert.equal(itemArchived[0].location, 'Archived');
assert.equal(itemArchived[0].roomId, '');
assert.equal(itemArchived[1].location, 'Room 7');
assert.equal(itemArchived[1].roomId, 'room-7');
assert.notEqual(itemArchived[0], history[0]);
assert.equal(itemArchived[1], history[1]);
