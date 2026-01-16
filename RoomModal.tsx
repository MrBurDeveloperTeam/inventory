
import React, { useState, useMemo } from 'react';
import {
  X,
  Package,
  Search,
  Plus,
  Minus,
  Trash2,
  ChevronDown,
  FileDown
} from 'lucide-react';
import { Room, Item, ActivityLog, Category, UOM, ItemBatch } from './types';
import { CATEGORIES, UOMS } from './constants';

interface RoomModalProps {
  room: Room;
  allRooms: Room[];
  logs: ActivityLog[];
  onClose: () => void;
  onUpdateName: (id: string, name: string) => void;
  onReceive: (roomId: string, itemData: Partial<Item>, qty: number, price: number, purchaseDate: string, expiry?: string) => void;
  onUpdateQty: (roomId: string, itemId: string, delta: number) => void;
  onUpdateBatchQty: (roomId: string, itemId: string, batchIndex: number, delta: number) => void;
  onTransfer: (fromRoomId: string, toRoomId: string, itemId: string, quantity: number, batchIndex?: number) => void;
  onDeleteItem: (roomId: string, itemId: string) => void;
  readOnly?: boolean;
}

const RoomModal: React.FC<RoomModalProps> = ({ room, allRooms, logs, onClose, onUpdateName, onReceive, onUpdateQty, onUpdateBatchQty, onTransfer, onDeleteItem, readOnly = false }) => {
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveMode, setReceiveMode] = useState<'existing' | 'new'>('existing');
  const [selectedItemIdx, setSelectedItemIdx] = useState<string>('');
  const [formData, setFormData] = useState<Partial<Item>>({
    name: '', brand: '', category: 'consumables', uom: 'box', code: '', vendor: '', description: ''
  });
  const [receiveQty, setReceiveQty] = useState(0);
  const [receivePrice, setReceivePrice] = useState(0);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expiry, setExpiry] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [openBatchRows, setOpenBatchRows] = useState<Record<string, boolean>>({});
  const [transferContext, setTransferContext] = useState<{ item: Item; toRoomId: string; batchIndex?: number; availableQty: number } | null>(null);
  const [transferQty, setTransferQty] = useState(0);
  const targetRoomName = transferContext ? (allRooms.find(r => r.id === transferContext.toRoomId)?.name || 'Selected room') : '';
  const [bulkTransferContext, setBulkTransferContext] = useState<{ item: Item; toRoomId: string } | null>(null);
  const [deleteContext, setDeleteContext] = useState<{ item: Item; batchIndex?: number } | null>(null);

  const filteredItems = useMemo(() => {
    return room.items.filter(i =>
      i.name.toLowerCase().includes(roomSearch.toLowerCase()) ||
      i.brand.toLowerCase().includes(roomSearch.toLowerCase()) ||
      i.code.toLowerCase().includes(roomSearch.toLowerCase())
    );
  }, [room.items, roomSearch]);

  const itemsByCategory = useMemo<Record<string, Item[]>>(() => {
    const groups: Record<string, Item[]> = {};
    filteredItems.forEach(item => {
      const cat = (item.category || 'uncategorized').toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredItems]);

  const toggleBatchRow = (id: string) => {
    setOpenBatchRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedItemIdx(val);
    if (val === 'new') {
      setReceiveMode('new');
      setFormData({ name: '', brand: '', category: 'consumables', uom: 'box', code: '', vendor: '', description: '' });
    } else if (val !== '') {
      setReceiveMode('existing');
      const item = room.items[parseInt(val)];
      setFormData({ ...item });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onReceive(room.id, formData, receiveQty, receivePrice, purchaseDate, hasExpiry ? expiry : undefined);
    setIsReceiving(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', brand: '', category: 'consumables', uom: 'box', code: '', vendor: '', description: '' });
    setReceiveQty(0);
    setReceivePrice(0);
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setExpiry('');
    setHasExpiry(false);
    setSelectedItemIdx('');
    setIsReceiving(false);
  };

  const openTransferModal = (item: Item, toRoomId: string, batchIndex?: number, availableQty?: number) => {
    const qty = availableQty ?? item.quantity;
    setTransferContext({ item, toRoomId, batchIndex, availableQty: qty });
    setTransferQty(qty);
  };

  const handleRelocateSelect = (item: Item, value: string) => {
    if (value === '') return;
    const targetId = value;
    if (targetId === room.id) return;
    const hasMultipleBatches = (item.batches?.length || 0) > 1;
    if (hasMultipleBatches) {
      setBulkTransferContext({ item, toRoomId: targetId });
      return;
    }
    openTransferModal(item, targetId);
  };

  const handleBatchRelocateSelect = (item: Item, batchIndex: number, batch: ItemBatch, value: string) => {
    if (value === '') return;
    const targetId = value;
    if (targetId === room.id) return;
    openTransferModal(item, targetId, batchIndex, batch.qty);
  };

  const confirmTransfer = () => {
    if (!transferContext) return;
    const maxQty = Math.max(transferContext.availableQty, 0);
    const qtyToMove = Math.min(Math.max(transferQty || 0, 1), maxQty);
    onTransfer(room.id, transferContext.toRoomId, transferContext.item.id, qtyToMove, transferContext.batchIndex);
    setTransferContext(null);
    setTransferQty(0);
  };

  const cancelTransfer = () => {
    setTransferContext(null);
    setTransferQty(0);
  };

  const requestDeleteItem = (item: Item) => {
    setDeleteContext({ item });
  };

  const requestDeleteBatch = (item: Item, batchIndex: number) => {
    setDeleteContext({ item, batchIndex });
  };

  const confirmDelete = () => {
    if (!deleteContext) return;
    if (typeof deleteContext.batchIndex === 'number') {
      const targetBatch = deleteContext.item.batches?.[deleteContext.batchIndex];
      const delta = targetBatch ? -targetBatch.qty : 0;
      onUpdateBatchQty(room.id, deleteContext.item.id, deleteContext.batchIndex, delta);
    } else {
      onDeleteItem(room.id, deleteContext.item.id);
    }
    setDeleteContext(null);
  };

  const cancelDelete = () => setDeleteContext(null);
  const confirmBulkTransfer = () => {
    if (!bulkTransferContext) return;
    onTransfer(room.id, bulkTransferContext.toRoomId, bulkTransferContext.item.id, bulkTransferContext.item.quantity);
    setBulkTransferContext(null);
  };
  const cancelBulkTransfer = () => setBulkTransferContext(null);

  // Existing item pricing preview
  const selectedExistingItem = receiveMode === 'existing' && selectedItemIdx !== '' ? room.items[parseInt(selectedItemIdx)] : null;
  const currentQty = selectedExistingItem ? selectedExistingItem.quantity : 0;
  const currentUnitPrice = selectedExistingItem ? selectedExistingItem.price : 0;
  const incomingQty = receiveQty || 0;
  const incomingPrice = receivePrice || 0;
  const newQty = currentQty + incomingQty;
  const newAvgPrice = newQty > 0 ? ((currentQty * currentUnitPrice) + (incomingQty * incomingPrice)) / newQty : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2">
      <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-[#4d9678] px-6 py-4 flex items-center justify-between text-white shrink-0 border-b border-white/10">
          <div className="flex-1">
            {readOnly ? (
              <h2 className="text-xl font-bold py-1">{room.name}</h2>
            ) : (
              <input
                type="text"
                value={room.name}
                onChange={(e) => onUpdateName(room.id, e.target.value)}
                className="bg-transparent border-b border-white/30 text-xl font-bold focus:border-white focus:outline-none w-full max-w-2xl placeholder:text-white/40 transition-colors"
                placeholder="Enter room name..."
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all border border-white/20">
              <FileDown className="w-4 h-4" /> Download PDF
            </button>
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all border border-white/10">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 custom-scrollbar bg-slate-50/50">
          <div className="flex items-center">
            {!readOnly && (
              !isReceiving ? (
                <button
                  onClick={() => setIsReceiving(true)}
                  className="bg-[#3498db] text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-[#2980b9] shadow-lg shadow-blue-100 transition-all"
                >
                  <Package className="w-4 h-4" /> Receive Stock
                </button>
              ) : (
                <button
                  onClick={() => setIsReceiving(false)}
                  className="bg-[#e74c3c] text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-[#c0392b] shadow-lg shadow-rose-100 transition-all"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              )
            )}
          </div>

          {isReceiving && (
            <div className="bg-[#ebf5fb] border border-[#c4e1f3] rounded-[1rem] p-6 shadow-sm animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[#2c78b2] font-black uppercase text-xs tracking-[0.2em]">Receive Stock</h4>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Product *</label>
                    <select value={selectedItemIdx} onChange={handleProductSelect} className="px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm" required>
                      <option value="">Choose existing product...</option>
                      {room.items.map((item, idx) => <option key={idx} value={idx}>{item.name} ({item.brand})</option>)}
                      <option value="new" className="text-[#3498db] font-bold">⊕ Create New Product...</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantity to Add *</label>
                    <input type="number" required placeholder="0" className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm"
                      value={receiveQty || ''} onChange={e => setReceiveQty(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purchase Price *</label>
                    <input type="number" step="0.01" required placeholder="0.00" className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm"
                      value={receivePrice || ''} onChange={e => setReceivePrice(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purchase Date *</label>
                    <input
                      type="date"
                      required
                      className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm"
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="w-4 h-4 accent-[#3498db] rounded" id="modalHasExp" />
                    <label htmlFor="modalHasExp" className="text-[10px] font-bold text-slate-600">This item has expiry date</label>
                  </div>
                </div>

                {hasExpiry && (
                  <div className="flex flex-col gap-1 max-w-[200px] animate-in slide-in-from-top-1 duration-200">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiry Date *</label>
                    <input type="date" className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm" value={expiry} onChange={e => setExpiry(e.target.value)} required={hasExpiry} />
                  </div>
                )}

                {receiveMode === 'new' && (
                  <div className="flex flex-col gap-4 animate-in slide-in-from-top-1 duration-200 mt-2">
                    <h5 className="text-[#3498db] font-black uppercase text-[9px] tracking-[0.2em] border-b border-slate-200/40 pb-1">New Product Details</h5>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Product Name *</label>
                        <input required placeholder="e.g. Dental Gloves" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Brand</label>
                        <input placeholder="e.g. 3M" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Code/SKU</label>
                        <input placeholder="e.g. DG-001" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">UOM</label>
                        <select className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs shadow-sm" value={formData.uom} onChange={e => setFormData({ ...formData, uom: e.target.value as UOM })}>
                          <option value="">Select UOM</option>
                          {UOMS.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Vendor</label>
                        <input placeholder="e.g. MedSupply Co" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.vendor} onChange={e => setFormData({ ...formData, vendor: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Category</label>
                        <select className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs shadow-sm" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as Category })}>
                          <option value="">Select category</option>
                          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Description</label>
                      <textarea rows={2} placeholder="Product description..." className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm resize-none" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                    </div>
                  </div>
                )}

                {selectedExistingItem && (
                  <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1 shadow-sm">
                    <div className="font-black text-slate-700 uppercase tracking-[0.15em] mb-1">Price Preview</div>
                    <div className="flex justify-between"><span>Current Stock:</span><span className="font-bold text-slate-800">{currentQty} {selectedExistingItem.uom} @ ${currentUnitPrice.toFixed(2)} = ${(currentQty * currentUnitPrice).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Adding:</span><span className="font-bold text-blue-600">{incomingQty} {selectedExistingItem.uom} @ ${incomingPrice.toFixed(2)} = ${(incomingQty * incomingPrice).toFixed(2)}</span></div>
                    <div className="flex justify-between border-t border-slate-100 pt-1"><span>After Receive:</span><span className="font-black text-emerald-600">{newQty} {selectedExistingItem.uom} @ ${newAvgPrice.toFixed(2)} avg = ${(newQty * newAvgPrice).toFixed(2)}</span></div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="bg-[#3498db] text-white px-6 py-2 rounded-lg font-black uppercase text-[10px] tracking-[0.2em] hover:bg-[#2980b9] shadow-md shadow-blue-100 transition-all">Receive Stock</button>
                  <button type="button" onClick={resetForm} className="bg-slate-500 text-white px-6 py-2 rounded-lg font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-600 shadow-md shadow-slate-100 transition-all">Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="font-bold text-slate-800 text-lg tracking-tight">Items in Room <span className="text-slate-400 font-medium">({room.items.length})</span></h3>
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3498db] w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search items by product, brand, or code..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#4d9678] focus:border-transparent outline-none shadow-sm transition-all"
                  value={roomSearch}
                  onChange={e => setRoomSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[1rem] overflow-x-auto shadow-sm custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px] text-xs">
                <thead className="bg-[#f8fafc] text-slate-500 font-black uppercase tracking-widest text-[9px] border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-5 w-[100px]">Brand</th>
                    <th className="px-3 py-5 w-[150px]">Product</th>
                    <th className="px-3 py-5 w-[80px]">Code</th>
                    <th className="px-3 py-5 w-[110px] text-center">Qty</th>
                    <th className="px-3 py-5 w-[60px]">UOM</th>
                    <th className="px-3 py-5 w-[80px]">Unit Price</th>
                    <th className="px-3 py-5 w-[80px]">Total</th>
                    <th className="px-3 py-5 w-[100px]">Vendor</th>
                    <th className="px-3 py-5 w-[100px]">Category</th>
                    <th className="px-3 py-5 w-[100px]">Expires</th>
                    <th className="px-3 py-5 w-[140px]">Location</th>
                    <th className="px-3 py-5 w-[60px] text-center">Action</th>
                  </tr>
                </thead>

                <tbody className="bg-white divide-y divide-slate-50">
                  {Object.entries(itemsByCategory).length > 0 ? (
                    Object.entries(itemsByCategory).map(([cat, items]: [string, Item[]]) => (
                      <React.Fragment key={cat}>
                        <tr className="bg-slate-100/70 border-y border-slate-200">
                          <td
                            colSpan={12}
                            className="px-3 py-3 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]"
                          >
                            {cat}
                          </td>
                        </tr>

                        {items.map((item) => {
                          const expiryDateObj = item.expiryDate ? new Date(item.expiryDate) : null;
                          const now = new Date();
                          const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                          const isExpired = expiryDateObj ? expiryDateObj < now : false;
                          const isExpiringSoon = expiryDateObj ? !isExpired && expiryDateObj <= soonThreshold : false;
                          const batches = item.batches && item.batches.length ? item.batches : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
                          const isOpen = !!openBatchRows[item.id];
                          const rowHighlight = isOpen ? 'bg-blue-200/60' : 'hover:bg-slate-50/60';

                          return (
                            <React.Fragment key={item.id}>
                              <tr
                                className={`${rowHighlight} transition-colors group`}
                              >
                                <td className="px-3 py-4 text-slate-500 whitespace-nowrap text-xs overflow-hidden text-ellipsis">
                                  #{item.brand || "-"}
                                </td>

                                <td className="px-3 py-4 font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                  {item.name}
                                </td>

                                <td className="px-3 py-4 text-slate-500 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">
                                  {item.code || "-"}
                                </td>

                                {/* Quantity Column - Hide adjustments in readOnly mode */}
                                <td className="px-3 py-4">
                                  {readOnly || batches.length > 1 ? (
                                    <span className="min-w-[28px] text-center font-bold text-slate-800 block">{item.quantity}</span>
                                  ) : (
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => item.quantity > 1 && onUpdateQty(room.id, item.id, -1)}
                                        disabled={item.quantity <= 1}
                                        className={`w-7 h-7 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${item.quantity <= 1 ? 'text-slate-300 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'}`}
                                        aria-label="Decrease quantity"
                                        title="Decrease"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <span className="min-w-[28px] text-center font-bold text-slate-800">
                                        {item.quantity}
                                      </span>
                                      <button
                                        onClick={() => onUpdateQty(room.id, item.id, 1)}
                                        className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors"
                                        aria-label="Increase quantity"
                                        title="Increase"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </td>

                                <td className="px-3 py-4 text-slate-600 font-medium text-xs capitalize whitespace-nowrap">
                                  {item.uom}
                                </td>

                                <td className="px-3 py-4 text-slate-500 font-semibold whitespace-nowrap">
                                  ${item.price.toFixed(2)}
                                </td>

                                <td className="px-3 py-4 font-black text-[#4d9678] tracking-tight whitespace-nowrap">
                                  ${(item.quantity * item.price).toFixed(2)}
                                </td>

                                <td className="px-3 py-4 text-slate-600 font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis">
                                  {item.vendor || "-"}
                                </td>

                                <td className="px-3 py-4">
                                  <span className="text-[10px] font-medium text-slate-500 capitalize tracking-wide">
                                    {item.category}
                                  </span>
                                </td>

                                <td
                                  className={`px-3 py-4 text-xs whitespace-nowrap ${isExpired
                                    ? "text-rose-600 font-bold"
                                    : isExpiringSoon
                                      ? "text-amber-600 font-bold"
                                      : "text-slate-500"
                                    }`}
                                >
                                  {item.expiryDate ? (
                                    <>
                                      {new Date(item.expiryDate).toLocaleDateString()}
                                      {isExpired && (
                                        <span className="ml-1 text-[9px] uppercase tracking-tight font-black">
                                          (EXP)
                                        </span>
                                      )}
                                      {isExpiringSoon && (
                                        <span className="ml-1 text-[9px] uppercase tracking-tight font-black">
                                          (SOON)
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    "-"
                                  )}
                                  {batches.length > 1 && (
                                    <button
                                      type="button"
                                      className="ml-2 text-[10px] font-bold text-blue-600 underline"
                                      onClick={(e) => { e.stopPropagation(); toggleBatchRow(item.id); }}
                                    >
                                      {isOpen ? "Hide" : "View"}
                                    </button>
                                  )}
                                </td>

                                <td className="px-3 py-4">
                                  {readOnly ? (
                                    <span className="text-slate-400 font-medium text-xs">{room.name}</span>
                                  ) : (
                                    <select
                                      className="bg-white text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer w-full text-ellipsis shadow-sm"
                                      value={room.id}
                                      onChange={(e) => handleRelocateSelect(item, e.target.value)}
                                      title="Transfer location"
                                    >
                                      <option value={room.id}>{room.name}</option>
                                      <option value="" disabled>
                                        -- Move to --
                                      </option>
                                      {allRooms
                                        .filter((r) => r.id !== room.id)
                                        .map((r) => (
                                          <option key={r.id} value={r.id}>
                                            {r.name}
                                          </option>
                                        ))}
                                    </select>
                                  )}
                                </td>
                                <td className="px-3 py-4 text-center">
                                  {!readOnly && (
                                    <button
                                      onClick={() => requestDeleteItem(item)}
                                      className="text-slate-300 hover:text-rose-600 transition-colors"
                                      title="Delete item"
                                      aria-label="Delete item"
                                    >
                                      <Trash2 className="w-4 h-4 mx-auto" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {isOpen && batches.map((b, idx) => {
                                const bExpiry = b.expiryDate ? new Date(b.expiryDate) : null;
                                const bExpired = bExpiry ? bExpiry < now : false;
                                const bSoon = bExpiry ? !bExpired && bExpiry <= soonThreshold : false;
                                return (
                                  <tr key={idx} className={`${isOpen ? 'bg-blue-100/50' : 'bg-slate-50/60'}`}>
                                    <td className="px-3 py-2 text-[11px] text-slate-400" colSpan={3}>Batch {idx + 1}</td>
                                    <td className="px-3 py-2 text-[11px] font-bold text-slate-800 text-center">
                                      {readOnly ? (
                                        <span className="min-w-[22px] text-center font-bold text-slate-800">
                                          {b.qty}
                                        </span>
                                      ) : (
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            onClick={() => b.qty > 1 && onUpdateBatchQty(room.id, item.id, idx, -1)}
                                            disabled={b.qty <= 1}
                                            className={`w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${b.qty <= 1 ? 'text-slate-300 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'}`}
                                            aria-label="Decrease batch quantity"
                                            title="Decrease batch quantity"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>
                                          <span className="min-w-[22px] text-center font-bold text-slate-800">
                                            {b.qty}
                                          </span>
                                          <button
                                            onClick={() => onUpdateBatchQty(room.id, item.id, idx, 1)}
                                            className="w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors"
                                            aria-label="Increase batch quantity"
                                            title="Increase batch quantity"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-slate-600"></td>
                                    <td className="px-3 py-2 text-[11px] text-slate-500">${b.unitPrice.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-[11px] font-bold text-[#4d9678]">${(b.qty * b.unitPrice).toFixed(2)}</td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400"></td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400"></td>
                                    <td className={`px-3 py-2 text-[11px] whitespace-nowrap ${bExpired ? "text-rose-600 font-bold" : bSoon ? "text-amber-600 font-bold" : "text-slate-500"
                                      }`}>
                                      {bExpiry ? bExpiry.toLocaleDateString() : "(No expiry)"}
                                      {bExpired && <span className="ml-1 text-[9px] uppercase font-black">(EXP)</span>}
                                      {bSoon && !bExpired && <span className="ml-1 text-[9px] uppercase font-black">(SOON)</span>}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400">
                                      {readOnly ? (
                                        <span className="text-slate-400 font-medium text-[10px]">{room.name}</span>
                                      ) : (
                                        <select
                                          className="bg-white text-[10px] font-semibold text-slate-600 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer w-full text-ellipsis shadow-sm"
                                          value={room.id}
                                          onChange={(e) => handleBatchRelocateSelect(item, idx, b, e.target.value)}
                                          title="Transfer batch"
                                        >
                                          <option value={room.id}>{room.name}</option>
                                          <option value="" disabled>-- Move to --</option>
                                          {allRooms
                                            .filter((r) => r.id !== room.id)
                                            .map((r) => (
                                              <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-center">
                                      {!readOnly && (
                                        <button
                                          onClick={() => requestDeleteBatch(item, idx)}
                                          className="text-slate-300 hover:text-rose-600 transition-colors"
                                          title="Delete batch"
                                          aria-label="Delete batch"
                                        >
                                          <Trash2 className="w-4 h-4 mx-auto" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={12}
                        className="py-24 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-xs opacity-50"
                      >
                        No Inventory
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-2 border-t border-slate-100 pt-6 pb-2">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Activity Log</h4>
              <button
                onClick={() => setIsLogOpen(!isLogOpen)}
                className="flex items-center gap-1 border border-slate-200 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all shadow-sm tracking-widest"
              >
                {isLogOpen ? 'Hide' : 'Show'} <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isLogOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isLogOpen && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {logs.length > 0 ? logs.map((log) => (
                  <div key={log.id} className="flex items-start justify-between p-3 bg-white rounded-xl border border-slate-50 group transition-all">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 p-1.5 rounded-lg ${log.action === 'receive' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                        {log.action === 'receive' ? <Plus className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                          {log.details}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5">{new Date(log.timestamp).toLocaleDateString()}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-slate-300 text-[10px] font-black uppercase tracking-[0.3em]">No activity found.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {transferContext && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div>
              <p className="text-xl font-semibold text-slate-700">
                Transfer "{transferContext.item.name}" to {targetRoomName}
              </p>
              <p className="text-sm text-slate-600 mt-1">How many do you want to transfer?</p>
              <p className="text-[12px] font-bold text-emerald-600 mt-1">Available: {transferContext.item.quantity}</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
              <input
                type="number"
                min={1}
                max={transferContext.item.quantity}
                value={transferQty || ''}
                onChange={(e) => setTransferQty(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={cancelTransfer}
                className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmTransfer}
                className="px-4 py-2 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkTransferContext && (
        <div className="fixed inset-0 bg-black/50 z-[115] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div>
              <p className="text-xl font-semibold text-slate-700">
                Transfer all batches of "{bulkTransferContext.item.name}"?
              </p>
              <p className="text-sm text-slate-600 mt-1">
                This will move {bulkTransferContext.item.quantity} {bulkTransferContext.item.uom} to {allRooms.find(r => r.id === bulkTransferContext.toRoomId)?.name || 'the selected room'}.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={cancelBulkTransfer}
                className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBulkTransfer}
                className="px-4 py-2 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors"
              >
                Transfer all
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteContext && (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div>
              <p className="text-xl font-semibold text-slate-700">
                {deleteContext.batchIndex !== undefined
                  ? `Delete Batch ${deleteContext.batchIndex + 1} of "${deleteContext.item.name}" ?`
                  : `Delete "${deleteContext.item.name}" ?`}
              </p>
              <p className="text-sm text-slate-500 mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-full bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomModal;
