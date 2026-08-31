// Explicit user-confirmation gate for chat-proposed inventory mutations
// (Phase INVENTORY-DETERMINISTIC-CONFIRMED-AI-ACTIONS-1).
//
// This component owns the ONLY path by which a chat-originated inventory
// action can reach an executor. Rendering this component does not mutate
// anything by itself. The `action` prop was produced entirely by the
// deterministic parser in aiExperience/inventoryConfirmedActionParser.ts
// from the user's own raw message — never from Gemini output.
//
// FRESH-STATE REVALIDATION: `rooms` is passed in from App.tsx's own live
// state on every render, so the value read inside handleConfirm at click
// time reflects the current app state, not a stale snapshot captured when
// the proposal was first created. Room/item existence and available
// quantity are re-checked here immediately before calling the executor.
import React, { useState } from 'react';
import type { Room, Item } from '../types';
import type { PendingInventoryAction } from '../aiExperience/inventoryConfirmedActionParser';

interface InventoryActionConfirmProps {
  action: PendingInventoryAction;
  rooms: Room[];
  onCancel: () => void;
  onConfirmed: () => void;
  receiveStock: (
    roomId: string,
    itemData: Partial<Item>,
    qty: number,
    price: number,
    purchaseDate: string,
    expiry?: string,
    createNewBatch?: boolean
  ) => Promise<void>;
  removeStock: (
    roomId: string,
    itemName: string,
    brand: string | undefined,
    qty: number,
    targetExpiry?: string
  ) => Promise<void>;
  moveItem: (
    fromRoomId: string,
    toRoomId: string,
    itemId: string,
    quantity: number,
    batchIndex?: number
  ) => Promise<void>;
}

const actionLabel: Record<PendingInventoryAction['type'], string> = {
  receive: 'Receive Stock',
  remove: 'Remove Stock',
  transfer: 'Transfer Stock',
};

const InventoryActionConfirm: React.FC<InventoryActionConfirmProps> = ({
  action,
  rooms,
  onCancel,
  onConfirmed,
  receiveStock,
  removeStock,
  moveItem,
}) => {
  // Guards against a rapid double-click executing the same proposal twice
  // — the Confirm button is disabled the instant this becomes true, before
  // any async work starts.
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleCancel = () => {
    if (isProcessing) return;
    onCancel();
  };

  const handleConfirm = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      if (action.type === 'receive') {
        const room = rooms.find((r) => r.id === action.roomId);
        if (!room) {
          setError('That room no longer exists. No stock was changed.');
          setIsProcessing(false);
          return;
        }
        await receiveStock(
          room.id,
          { name: action.itemName },
          action.quantity,
          action.price,
          new Date().toISOString().split('T')[0]
        );
        setSuccessMessage(`Received ${action.quantity} of "${action.itemName}" in ${room.name}.`);
        setIsProcessing(false);
        return;
      }

      if (action.type === 'remove') {
        const room = rooms.find((r) => r.id === action.roomId);
        if (!room) {
          setError('That room no longer exists. No stock was changed.');
          setIsProcessing(false);
          return;
        }
        const item = room.items.find((i) => i.id === action.itemId);
        if (!item) {
          setError('That item is no longer available in that room. No stock was changed.');
          setIsProcessing(false);
          return;
        }
        if (action.quantity > item.quantity) {
          setError(`Only ${item.quantity} available now — not enough to remove ${action.quantity}. No stock was changed.`);
          setIsProcessing(false);
          return;
        }
        await removeStock(room.id, item.name, item.brand || undefined, action.quantity);
        setSuccessMessage(`Removed ${action.quantity} of "${item.name}" from ${room.name}.`);
        setIsProcessing(false);
        return;
      }

      // transfer
      const fromRoom = rooms.find((r) => r.id === action.fromRoomId);
      const toRoom = rooms.find((r) => r.id === action.toRoomId);
      if (!fromRoom || !toRoom) {
        setError('One of the rooms no longer exists. No stock was changed.');
        setIsProcessing(false);
        return;
      }
      if (fromRoom.id === toRoom.id) {
        setError('Source and destination room must differ. No stock was changed.');
        setIsProcessing(false);
        return;
      }
      const item = fromRoom.items.find((i) => i.id === action.itemId);
      if (!item) {
        setError('That item is no longer available in the source room. No stock was changed.');
        setIsProcessing(false);
        return;
      }
      if (action.quantity > item.quantity) {
        setError(`Only ${item.quantity} available now — not enough to transfer ${action.quantity}. No stock was changed.`);
        setIsProcessing(false);
        return;
      }
      await moveItem(fromRoom.id, toRoom.id, item.id, action.quantity);
      setSuccessMessage(`Transferred ${action.quantity} of "${item.name}" from ${fromRoom.name} to ${toRoom.name}.`);
      setIsProcessing(false);
    } catch (err) {
      console.error('InventoryActionConfirm: execution failed', err);
      setError('Something went wrong performing this action. No stock change is guaranteed to have been saved — please check inventory before retrying.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center md:p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        {successMessage ? (
          <>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Done</h3>
            <p className="text-sm text-gray-700 mb-4">{successMessage}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onConfirmed}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{actionLabel[action.type]}</h3>

        <div className="space-y-1.5 text-sm text-gray-700 mb-4">
          <div><span className="font-medium">Item:</span> {action.itemName}</div>
          <div><span className="font-medium">Quantity:</span> {action.quantity}</div>
          {action.type === 'receive' && (
            <>
              <div><span className="font-medium">Destination room:</span> {action.roomName}</div>
              <div><span className="font-medium">Unit price:</span> ${action.price.toFixed(2)}</div>
            </>
          )}
          {action.type === 'remove' && (
            <div><span className="font-medium">Source room:</span> {action.roomName}</div>
          )}
          {action.type === 'transfer' && (
            <>
              <div><span className="font-medium">From room:</span> {action.fromRoomName}</div>
              <div><span className="font-medium">To room:</span> {action.toRoomName}</div>
            </>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isProcessing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? 'Working…' : 'Confirm'}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InventoryActionConfirm;
