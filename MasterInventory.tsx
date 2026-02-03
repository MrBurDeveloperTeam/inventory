
import React, { useState, useMemo } from 'react';
import {
  Search,
  Package,
  History,
  AlertTriangle,
  ClipboardCheck,
  Plus,
  FileText,
  BarChart3,
  FileDown,
  ClipboardList,
  ChevronDown,
  ArrowLeft,
  RefreshCcw,
  Trash2,
  Edit3,
  Calendar,
  Minus,
  Map as MapIcon,
  Activity,
  ArrowDownLeft,
  ArrowRight,
  Clock
} from 'lucide-react';
import { Room, Item, ActivityLog, PurchaseHistory, Category, UOM, ItemBatch } from './types';
import { CATEGORIES, UOMS } from './constants';
import ClinicAnalytics from './ClinicAnalytics';

interface MasterInventoryProps {
  rooms: Room[];
  history: PurchaseHistory[];
  logs: ActivityLog[];
  onReceive?: (roomId: string, itemData: Partial<Item>, qty: number, price: number, purchaseDate: string, expiry?: string) => void;
  onUpdateQty?: (roomId: string, itemId: string, delta: number) => void;
  onTransfer?: (fromRoomId: string, toRoomId: string, itemId: string, quantity: number, batchIndex?: number) => void;
  onUpdateBatchQty?: (roomId: string, itemId: string, batchIndex: number, delta: number) => void;
  onDeleteItem?: (roomId: string, itemId: string) => void;
  onUpdateItem?: (roomId: string, itemId: string, itemData: Partial<Item>) => void;
  onUpdateBatch?: (roomId: string, itemId: string, batchId: string, batchData: Partial<ItemBatch>) => void;
  readOnly?: boolean;
}

const MasterInventory: React.FC<MasterInventoryProps> = ({
  rooms,
  history,
  logs,
  onReceive,
  onUpdateQty,
  onTransfer,
  onUpdateBatchQty,
  onDeleteItem,
  onUpdateItem,
  onUpdateBatch,
  readOnly = false
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'receive' | 'history' | 'expiring' | 'analytics'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // History Filter State
  const [historyCategory, setHistoryCategory] = useState('all');
  const [historyVendor, setHistoryVendor] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('all');
  const [inventoryVendor, setInventoryVendor] = useState('all');
  const [inventoryLocation, setInventoryLocation] = useState('all');

  // Form State for Master Receiving
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [receiveMode, setReceiveMode] = useState<'existing' | 'new' | 'edit'>('existing');
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [selectedProductKey, setSelectedProductKey] = useState<string>('');
  const [formData, setFormData] = useState<Partial<Item>>({
    name: '', brand: '', category: 'consumables', uom: 'pcs', code: '', vendor: '', description: ''
  });
  const [receiveQty, setReceiveQty] = useState(0);
  const [receivePrice, setReceivePrice] = useState(0);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expiry, setExpiry] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ roomId: string; itemId: string; name: string; batchIndex?: number; qty?: number; expiryDate?: string } | null>(null);

  // Flattened items for the master list
  const allItems = useMemo(() => {
    return rooms.flatMap(room =>
      room.items.map(item => ({ ...item, roomName: room.name, roomId: room.id }))
    ).filter(item =>
      (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.roomName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)) &&
      (inventoryCategory === 'all' || item.category === inventoryCategory) &&
      (inventoryVendor === 'all' || item.vendor === inventoryVendor) &&
      (inventoryLocation === 'all' || String(item.roomId) === inventoryLocation)
    ).sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : Date.now();
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : Date.now();
      return dateA - dateB;
    });
  }, [rooms, searchTerm, inventoryCategory, inventoryVendor, inventoryLocation]);

  // Filtered History
  const filteredHistory = useMemo(() => {
    const startBoundary = historyStartDate ? new Date(`${historyStartDate}T00:00:00`) : null;
    // If only a start date is provided, treat it as a single-day filter
    const endBoundary = historyEndDate
      ? new Date(`${historyEndDate}T23:59:59`)
      : historyStartDate
        ? new Date(`${historyStartDate}T23:59:59`)
        : null;

    return history.filter(h => {
      const matchCat = historyCategory === 'all' || h.category === historyCategory;
      const matchVendor = historyVendor === 'all' || h.vendor === historyVendor;
      const recordDate = new Date(h.timestamp);
      const matchDateStart = !startBoundary || recordDate >= startBoundary;
      const matchDateEnd = !endBoundary || recordDate <= endBoundary;
      const matchSearch = h.productName.toLowerCase().includes(historySearch.toLowerCase()) ||
        h.brand.toLowerCase().includes(historySearch.toLowerCase()) ||
        (h.description?.toLowerCase().includes(historySearch.toLowerCase()) ?? false);
      return matchCat && matchVendor && matchDateStart && matchDateEnd && matchSearch;
    });
  }, [history, historyCategory, historyVendor, historySearch, historyStartDate, historyEndDate]);

  const groupedHistory = useMemo(() => {
    const sorted = [...filteredHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const groups: Record<string, PurchaseHistory[]> = {};
    sorted.forEach((h) => {
      const key = new Date(h.timestamp).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return Object.entries(groups);
  }, [filteredHistory]);

  const uniqueVendors = useMemo(() => {
    const vendors = new Set(history.map(h => h.vendor).filter(Boolean));
    return Array.from(vendors);
  }, [history]);

  const uniqueInventoryVendors = useMemo(() => {
    const vendors = new Set<string>();
    rooms.forEach(room => {
      room.items.forEach(item => {
        if (item.vendor) vendors.add(item.vendor);
      });
    });
    return Array.from(vendors);
  }, [rooms]);

  const inventoryLocations = useMemo(() => rooms.map(r => ({ id: r.id, name: r.name })), [rooms]);

  const [openBatchRows, setOpenBatchRows] = useState<Record<string, boolean>>({});
  const toggleBatchRow = (key: string) => {
    setOpenBatchRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Group by category for the table - and preserve category encounter order
  // Since allItems is sorted old -> new, the groups array will be sorted by the oldest item in each category
  const groupedItems = useMemo(() => {
    const groups: Array<{ category: string; items: any[] }> = [];
    const categoryMap = new Map<string, any[]>();

    allItems.forEach(item => {
      const cat = (item.category || 'other').toUpperCase();
      if (!categoryMap.has(cat)) {
        const newGroup: any[] = [];
        categoryMap.set(cat, newGroup);
        groups.push({ category: cat, items: newGroup });
      }
      categoryMap.get(cat)!.push(item);
    });
    return groups;
  }, [allItems]);

  // Expiry Logic - track per batch, not just per item
  const expiringItems = useMemo(() => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const entries: Array<{
      key: string;
      id: string;
      roomId: string;
      roomName: string;
      name: string;
      brand: string;
      code: string;
      expiryDate: string;
      qty: number;
      price: number;
      uom?: string;
      batchIndex: number;
    }> = [];
    rooms.forEach(room => {
      room.items.forEach(item => {
        const batches = item.batches && item.batches.length > 0
          ? item.batches
          : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
        batches.forEach((b, idx) => {
          if (!b.expiryDate) return;
          const expDate = new Date(b.expiryDate);
          if (expDate <= thirtyDaysFromNow) {
            entries.push({
              key: `${room.id}-${item.id}-${idx}`,
              id: item.id,
              roomId: room.id,
              roomName: room.name,
              name: item.name,
              brand: item.brand,
              code: item.code,
              expiryDate: b.expiryDate,
              qty: b.qty,
              price: b.unitPrice,
              uom: item.uom,
              batchIndex: idx
            });
          }
        });
      });
    });
    // Sort soonest first
    return entries.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }, [rooms]);

  const handleEditItem = (item: any) => {
    setActiveTab('receive');
    setReceiveMode('edit');
    setEditingBatchId(null);
    setFormData({ ...item });
    setReceiveQty(item.quantity);
    setReceivePrice(item.price);
    setHasExpiry(!!item.expiryDate);
    setExpiry(item.expiryDate || '');
    setSelectedProductKey(`${item.roomId}|${item.id}`);
    setSelectedRoomId(item.roomId);
  };

  const handleEditBatch = (item: any, batch: any) => {
    setActiveTab('receive');
    setReceiveMode('edit');
    setEditingBatchId(batch.id);
    setFormData({ ...item });
    setReceiveQty(batch.qty);
    setReceivePrice(batch.unitPrice);
    setHasExpiry(!!batch.expiryDate);
    setExpiry(batch.expiryDate || '');
    setSelectedProductKey(`${item.roomId}|${item.id}`);
    setSelectedRoomId(item.roomId);
  };

  const handleProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedProductKey(val);
    if (val === 'new') {
      setReceiveMode('new');
      setFormData({ name: '', brand: '', category: 'consumables', uom: 'pcs', code: '', vendor: '', description: '' });
    } else if (val !== '') {
      setReceiveMode('existing');
      const [rId, ...rest] = val.split('|');
      const iId = rest.join('|');
      const room = rooms.find(r => r.id === rId);
      const item = room?.items.find(i => i.id === iId);
      if (item) setFormData({ ...item });
    } else {
      setReceiveMode('existing');
      setFormData({ name: '', brand: '', category: 'consumables', uom: 'pcs', code: '', vendor: '', description: '' });
    }
  };

  const handleReceiveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('MasterInventory: handleReceive called', { selectedRoomId, receiveQty, receivePrice });
    if (!selectedRoomId || receiveQty <= 0) {
      alert('Please select a room and enter a valid quantity.');
      return;
    }
    if (!onReceive || !onUpdateItem || !onUpdateBatch) return;

    if (receiveMode === 'edit') {
      const iId = selectedProductKey.split('|')[1];
      if (iId) {
        if (editingBatchId) {
          onUpdateBatch(selectedRoomId, iId, editingBatchId, {
            qty: receiveQty,
            unitPrice: receivePrice,
            expiryDate: hasExpiry ? expiry : null
          });
        } else {
          onUpdateItem(selectedRoomId, iId, {
            ...formData,
            quantity: receiveQty,
            price: receivePrice,
            expiryDate: hasExpiry ? expiry : null
          });
        }
      }
    } else {
      onReceive(selectedRoomId, formData, receiveQty, receivePrice, purchaseDate, hasExpiry ? expiry : undefined);
    }

    setActiveTab('all');
    resetReceiveForm();
  };

  const resetReceiveForm = () => {
    setFormData({ name: '', brand: '', category: 'consumables', uom: 'pcs', code: '', vendor: '', description: '' });
    setReceiveQty(0);
    setReceivePrice(0);
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setExpiry('');
    setHasExpiry(false);
    setSelectedProductKey('');
    setSelectedRoomId('');
    setReceiveMode('existing');
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB');
  };

  const getDaysDiff = (dateStr: string) => {
    const now = new Date();
    const expiry = new Date(dateStr);
    const diffTime = now.getTime() - expiry.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const downloadAllPdf = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text("DentaStock Pro - Complete Inventory List", 14, 15);
    const tableData = allItems.map(i => [
      i.brand || '-', i.name, i.code || '-', i.quantity, i.uom,
      `$${i.price.toFixed(2)}`, `$${(i.quantity * i.price).toFixed(2)}`,
      i.vendor || '-', i.category, i.expiryDate || '-', i.roomName
    ]);
    (doc as any).autoTable({
      startY: 20,
      head: [['Brand', 'Product', 'Code', 'Qty', 'UOM', 'Price', 'Total', 'Vendor', 'Category', 'Expires', 'Location']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillStyle: '#4d9678' }
    });
    doc.save(`complete_inventory_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Navigation Tabs Bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-slate-100 p-2 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar-hide">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-[#4d9678] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <ClipboardList className="w-4 h-4" /> All Inventory
          </button>
          {!readOnly && (
            <button
              onClick={() => setActiveTab('receive')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'receive' ? 'bg-[#3498db] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Package className="w-4 h-4" /> Receive Stock
            </button>
          )}
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'history' ? 'bg-[#9b59b6] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <History className="w-4 h-4" /> Purchase History
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <BarChart3 className="w-4 h-4" /> Usage Stats
          </button>
          <button
            onClick={() => setActiveTab('expiring')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'expiring' ? 'bg-[#f39c12] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <AlertTriangle className="w-4 h-4" /> Expiring Items
            {expiringItems.length > 0 && <span className={`ml-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${activeTab === 'expiring' ? 'bg-white text-[#f39c12]' : 'bg-[#f39c12] text-white'}`}>{expiringItems.length}</span>}
          </button>
        </div>
        <div className="hidden md:flex px-4 border-l border-slate-100">
          <button onClick={downloadAllPdf} className="text-slate-400 hover:text-[#4d9678] transition-colors p-2 rounded-lg" title="Export All Data">
            <FileDown className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-slate-100 p-6 md:p-8 min-h-[500px]">

        {/* VIEW: ALL INVENTORY */}
        {
          activeTab === 'all' && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-sm">
                <select
                  value={inventoryCategory}
                  onChange={e => setInventoryCategory(e.target.value)}
                  className="h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-600 outline-none"
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select
                  value={inventoryVendor}
                  onChange={e => setInventoryVendor(e.target.value)}
                  className="h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-600 outline-none"
                >
                  <option value="all">All Vendors</option>
                  {uniqueInventoryVendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select
                  value={inventoryLocation}
                  onChange={e => setInventoryLocation(e.target.value)}
                  className="h-10 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-600 outline-none"
                >
                  <option value="all">All Locations</option>
                  {inventoryLocations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search records..."
                    className="h-10 w-full pl-10 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-xs font-semibold text-slate-600 outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="hidden md:block border border-slate-200 rounded-2xl overflow-hidden shadow-sm custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#f8fafc] text-slate-500 font-black uppercase tracking-widest text-[9px] border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-5 w-[80px]">Brand</th>
                      <th className="px-3 py-5 w-[240px]">Product</th>
                      <th className="px-3 py-5 w-[70px]">Code</th>
                      <th className="px-3 py-5 w-[50px] text-center">Qty</th>
                      <th className="px-3 py-5 w-[50px]">UOM</th>
                      <th className="px-3 py-5 w-[70px]">Price</th>
                      <th className="px-3 py-5 w-[80px]">Total</th>
                      <th className="px-3 py-5 w-[80px]">Vendor</th>
                      <th className="px-3 py-5 w-[80px]">Category</th>
                      <th className="px-3 py-5 w-[80px]">Expires</th>
                      <th className="px-3 py-5 w-[80px]">Location</th>

                    </tr>
                  </thead>

                  {/* Match Purchase History look */}
                  {/* Chronological groupings */}
                  <tbody className="bg-white divide-y divide-slate-50">
                    {groupedItems.length > 0 ? (
                      groupedItems.map(({ category, items }) => (
                        <React.Fragment key={category}>
                          <tr className="bg-slate-100/70 border-y border-slate-200">
                            <td
                              colSpan={11}
                              className="px-6 py-3 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]"
                            >
                              {category}
                            </td>
                          </tr>

                          {(items as any[]).map((item) => {
                            const expiryDateObj = item.expiryDate ? new Date(item.expiryDate) : null;
                            const now = new Date();
                            const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                            const isExpired = expiryDateObj ? expiryDateObj < now : false;
                            const isExpiringSoon = expiryDateObj ? !isExpired && expiryDateObj <= soonThreshold : false;
                            const batches = item.batches && item.batches.length ? item.batches : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
                            const batchKey = `${item.roomId}-${item.id}`;
                            const isOpen = !!openBatchRows[batchKey];
                            const rowHighlight = isOpen ? 'bg-blue-200/60' : 'hover:bg-slate-50/60';

                            return (
                              <React.Fragment key={`${item.roomId}-${item.id}`}>
                                <tr
                                  className={`${rowHighlight} transition-colors`}
                                >
                                  <td className="px-3 py-4 text-slate-500 whitespace-nowrap text-xs">
                                    #{item.brand || '-'}
                                  </td>

                                  <td className="px-3 py-4 text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                    <div className="font-bold truncate max-w-[200px]" title={item.name}>{item.name}</div>
                                    {item.description && (
                                      <div className="text-[10px] text-slate-500 italic mt-0.5 truncate max-w-[200px]" title={item.description}>
                                        {item.description}
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-3 py-4 text-slate-500 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">
                                    {item.code || '-'}
                                  </td>

                                  <td className="px-3 py-4">
                                    <div className="flex items-center justify-center gap-2">
                                      {(!readOnly && batches.length === 1 && onUpdateQty) ? (
                                        <>
                                          <button
                                            onClick={() => item.quantity > 1 && onUpdateQty(item.roomId, item.id, -1)}
                                            disabled={item.quantity <= 1}
                                            className={`w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${item.quantity <= 1 ? 'text-slate-200 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'}`}
                                            aria-label="Decrease quantity"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>

                                          <span className="min-w-[24px] text-center font-bold text-slate-800 text-xs">
                                            {item.quantity}
                                          </span>

                                          <button
                                            onClick={() => onUpdateQty(item.roomId, item.id, 1)}
                                            className="w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors"
                                            aria-label="Increase quantity"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </>
                                      ) : (
                                        <span className="font-bold text-slate-800 text-center">{item.quantity}</span>
                                      )}
                                    </div>
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
                                    {item.vendor || '-'}
                                  </td>

                                  <td className="px-3 py-4">
                                    <span className="text-[10px] font-medium text-slate-500 capitalize tracking-wide">
                                      {item.category}
                                    </span>
                                  </td>

                                  <td
                                    className={`px-3 py-4 text-xs whitespace-nowrap ${isExpired
                                      ? 'text-rose-600 font-bold'
                                      : isExpiringSoon
                                        ? 'text-amber-600 font-bold'
                                        : 'text-slate-500'
                                      }`}
                                  >
                                    {item.expiryDate ? (
                                      <>
                                        {new Date(item.expiryDate).toLocaleDateString('en-GB')}
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
                                      '-'
                                    )}
                                    {batches.length > 1 && (
                                      <button
                                        type="button"
                                        className="ml-2 text-[10px] font-bold text-blue-600 underline"
                                        onClick={(e) => { e.stopPropagation(); toggleBatchRow(batchKey); }}
                                      >
                                        {isOpen ? 'Hide' : 'View'}
                                      </button>
                                    )}
                                  </td>

                                  <td className="px-3 py-4">
                                    <span className="text-emerald-600 font-bold text-[10px] whitespace-nowrap border border-emerald-100 px-2 py-0.5 rounded-lg bg-emerald-50/30">
                                      {item.roomName}
                                    </span>
                                  </td>

                                </tr>
                                {isOpen && (
                                  batches.map((b: any, idx: number) => {
                                    const bExpiry = b.expiryDate ? new Date(b.expiryDate) : null;
                                    const bExpired = bExpiry ? bExpiry < now : false;
                                    const bSoon = bExpiry ? !bExpired && bExpiry <= soonThreshold : false;
                                    return (
                                      <tr key={idx} className={`${isOpen ? 'bg-blue-100/50' : 'bg-slate-50/60'}`}>
                                        <td className="px-6 py-2 text-[11px] text-slate-400">Batch {idx + 1}</td>
                                        <td className="px-6 py-2 text-[11px] font-semibold text-slate-700"></td>
                                        <td className="px-6 py-2 text-[11px] text-slate-400"></td>
                                        <td className="px-6 py-2">
                                          <div className="flex items-center justify-center gap-2">
                                            {(!readOnly && onUpdateBatchQty) ? (
                                              <>
                                                <button
                                                  onClick={() => b.qty > 1 && onUpdateBatchQty(item.roomId, item.id, idx, -1)}
                                                  disabled={b.qty <= 1}
                                                  className={`w-5 h-5 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${b.qty <= 1 ? 'text-slate-200 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'}`}
                                                  aria-label="Decrease batch quantity"
                                                >
                                                  <Minus className="w-2.5 h-2.5" />
                                                </button>
                                                <span className="min-w-[20px] text-center font-bold text-slate-800 text-[10px]">
                                                  {b.qty}
                                                </span>
                                                <button
                                                  onClick={() => onUpdateBatchQty(item.roomId, item.id, idx, 1)}
                                                  className="w-5 h-5 flex items-center justify-center border border-slate-200 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors"
                                                  aria-label="Increase batch quantity"
                                                >
                                                  <Plus className="w-2.5 h-2.5" />
                                                </button>
                                              </>
                                            ) : (
                                              <span className="font-bold text-slate-800 text-center">{b.qty}</span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-6 py-2 text-[11px] text-slate-600"></td>
                                        <td className="px-6 py-2 text-[11px] text-slate-500">${b.unitPrice.toFixed(2)}</td>
                                        <td className="px-6 py-2 text-[11px] font-bold text-[#4d9678]">${(b.qty * b.unitPrice).toFixed(2)}</td>
                                        <td className="px-6 py-2 text-[11px] text-slate-400"></td>
                                        <td className="px-6 py-2 text-[11px] text-slate-400"></td>
                                        <td className={`px-6 py-2 text-[11px] whitespace-nowrap ${bExpired ? 'text-rose-600 font-bold' : bSoon ? 'text-amber-600 font-bold' : 'text-slate-500'
                                          }`}>
                                          {bExpiry ? bExpiry.toLocaleDateString('en-GB') : '(No expiry)'}
                                          {bExpired && <span className="ml-1 text-[9px] uppercase font-black">(EXP)</span>}
                                          {bSoon && !bExpired && <span className="ml-1 text-[9px] uppercase font-black">(SOON)</span>}
                                        </td>
                                        <td className="px-6 py-2 text-[11px] text-slate-400"></td>

                                      </tr>
                                    );
                                  })
                                )}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={11}
                          className="py-24 text-center text-slate-300 font-black uppercase tracking-[0.3em] opacity-50"
                        >
                          No Items Found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* MOBILE LIST VIEW */}
              <div className="md:hidden space-y-6 pb-20">
                {groupedItems.length > 0 ? (
                  groupedItems.map(({ category, items }) => (
                    <div key={category} className="space-y-3">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                        <div className="h-px bg-slate-100 flex-1" />
                        {category}
                        <div className="h-px bg-slate-100 flex-1" />
                      </h3>

                      {(items as any[]).map((item) => {
                        const expiryDateObj = item.expiryDate ? new Date(item.expiryDate) : null;
                        const now = new Date();
                        const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                        const isExpired = expiryDateObj ? expiryDateObj < now : false;
                        const isExpiringSoon = expiryDateObj ? !isExpired && expiryDateObj <= soonThreshold : false;
                        const batches = item.batches && item.batches.length ? item.batches : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
                        const batchKey = `${item.roomId}-${item.id}`;
                        const isOpen = !!openBatchRows[batchKey];

                        return (
                          <div key={batchKey} className={`bg-white rounded-2xl border ${isOpen ? 'border-blue-200 ring-4 ring-blue-50' : 'border-slate-100 shadow-sm'} overflow-hidden transition-all duration-300`}>
                            {/* Card Header */}
                            <div className="p-4 border-b border-slate-50 flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">
                                    {item.brand || 'No Brand'}
                                  </span>
                                  {item.code && (
                                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold">
                                      {item.code}
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-bold text-slate-800 leading-tight truncate" title={item.name}>{item.name}</h4>
                                {item.description && (
                                  <p className="text-[11px] text-slate-500 italic mt-1 leading-relaxed">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Main Info Area */}
                            <div className="px-4 py-5 bg-gradient-to-br from-white to-slate-50/50 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                {readOnly || batches.length > 1 || !onUpdateQty ? (
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity</span>
                                    <span className="text-xl font-black text-slate-800">{item.quantity}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                                    <button
                                      onClick={() => item.quantity > 1 && onUpdateQty(item.roomId, item.id, -1)}
                                      disabled={item.quantity <= 1}
                                      className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
                                    >
                                      <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="w-10 text-center font-black text-lg text-slate-800">
                                      {item.quantity}
                                    </span>
                                    <button
                                      onClick={() => onUpdateQty(item.roomId, item.id, 1)}
                                      className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-emerald-50 hover:text-emerald-500 transition-all active:scale-90"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unit</span>
                                  <span className="text-sm font-bold text-slate-600 capitalize">{item.uom}</span>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Value</div>
                                <div className="text-xl font-black text-[#4d9678] tracking-tight">
                                  ${(item.quantity * item.price).toFixed(2)}
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 mt-1">
                                  ${item.price.toFixed(2)} / ea
                                </div>
                              </div>
                            </div>

                            {/* Secondary Details Area */}
                            <div className="p-4 bg-white border-t border-slate-50 space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Location</span>
                                  <div className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black inline-flex items-center gap-1.5 border border-emerald-100">
                                    <MapIcon className="w-3 h-3" />
                                    {item.roomName}
                                  </div>
                                </div>
                                <div className="space-y-1 text-right">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Expiration</span>
                                  <div className={`flex items-center justify-end gap-1.5 text-[11px] font-bold ${isExpired ? "text-rose-600" : isExpiringSoon ? "text-amber-600" : "text-slate-600"}`}>
                                    <Calendar className="w-3.5 h-3.5" />
                                    {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-GB') : 'No Date'}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-3 pt-2">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Vendor</span>
                                  <span className="text-[11px] font-bold text-slate-600">{item.vendor || 'Unknown'}</span>
                                </div>

                                {batches.length > 1 && (
                                  <button
                                    onClick={() => toggleBatchRow(batchKey)}
                                    className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                  >
                                    {isOpen ? `Hide ${batches.length} Batches` : `View ${batches.length} Batches`}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Mobile Batches Expansion */}
                            {isOpen && (
                              <div className="bg-blue-50/50 border-t border-blue-100 p-3 space-y-2">
                                {batches.map((b: any, bIdx: number) => {
                                  const bExpDate = b.expiryDate ? new Date(b.expiryDate) : null;
                                  const bExp = bExpDate ? bExpDate < now : false;
                                  const bSoon = bExpDate ? !bExp && bExpDate <= soonThreshold : false;
                                  return (
                                    <div key={bIdx} className="bg-white rounded-xl p-3 border border-blue-100 shadow-sm flex items-center justify-between">
                                      <div className="flex items-center gap-4">
                                        {!readOnly && onUpdateBatchQty ? (
                                          <div className="flex items-center bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                                            <button
                                              onClick={() => b.qty > 1 && onUpdateBatchQty(item.roomId, item.id, bIdx, -1)}
                                              className="w-6 h-6 flex items-center justify-center text-slate-400"
                                            >
                                              <Minus className="w-2.5 h-2.5" />
                                            </button>
                                            <span className="w-6 text-center text-xs font-black text-slate-700">{b.qty}</span>
                                            <button
                                              onClick={() => onUpdateBatchQty(item.roomId, item.id, bIdx, 1)}
                                              className="w-6 h-6 flex items-center justify-center text-slate-400"
                                            >
                                              <Plus className="w-2.5 h-2.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="text-center w-8">
                                            <div className="text-[10px] font-black text-slate-800">{b.qty}</div>
                                          </div>
                                        )}
                                        <div className="space-y-1">
                                          <div className="text-[11px] font-black text-[#4d9678]">${(b.qty * b.unitPrice).toFixed(2)}</div>
                                          <div className={`text-[9px] font-bold flex items-center gap-1 ${bExp ? 'text-rose-500' : bSoon ? 'text-amber-500' : 'text-slate-400'}`}>
                                            <Calendar className="w-2.5 h-2.5" />
                                            {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : 'No Exp'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center flex flex-col items-center justify-center text-slate-300 gap-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                      <Package className="w-10 h-10" />
                    </div>
                    <div className="text-sm font-black uppercase tracking-[0.2em] opacity-50">No Items Found</div>
                  </div>
                )}
              </div>
            </div>
          )
        }


        {/* VIEW: RECEIVE STOCK */}
        {
          activeTab === 'receive' && (
            <div className="animate-in zoom-in-95 duration-200 w-full">
              <div className="flex items-center gap-3 mb-8">
                <div className="bg-blue-100 p-3 rounded-2xl text-[#3498db]"><Package className="w-6 h-6" /></div>
                <h4 className="text-[#3498db] font-bold text-xl tracking-tight">
                  {receiveMode === ('edit' as any) ? 'Edit Item Details' : 'Receive New Stock'}
                </h4>
              </div>
              <form onSubmit={handleReceiveSubmit} className="flex flex-col gap-8 w-full">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Product *</label>
                    <select value={selectedProductKey} onChange={handleProductSelect} className="px-4 py-3 rounded-xl border border-slate-200 bg-white font-normal text-slate-800 text-sm focus:ring-2 focus:ring-[#3498db] outline-none shadow-sm" required>
                      <option value="">Choose existing product...</option>
                      <option value="new" className="text-[#3498db] font-bold">⊕ Create New Product...</option>
                      {rooms.flatMap(r => r.items.map(i => (
                        <option key={`${r.id}|${i.id}`} value={`${r.id}|${i.id}`}>
                          {i.name} ({i.brand})
                        </option>
                      )))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Add to Location *</label>
                    <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value)} className="px-4 py-3 rounded-xl border border-slate-200 font-normal bg-white text-slate-800 text-sm focus:ring-2 focus:ring-[#3498db] outline-none shadow-sm" required>
                      <option value="">Select room...</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantity *</label>
                    <input type="number" required placeholder="0" className="px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none shadow-sm" value={receiveQty || ''} onChange={e => setReceiveQty(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unit Price *</label>
                    <input type="number" step="0.01" required placeholder="0.00" className="px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none shadow-sm" value={receivePrice || ''} onChange={e => setReceivePrice(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purchase Date *</label>
                    <input
                      type="date"
                      required
                      className="px-4 py-3 rounded-xl border border-slate-200 font-normal text-sm focus:ring-2 focus:ring-[#3498db] outline-none shadow-sm"
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="hasExpiryForm" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="w-5 h-5 accent-[#3498db] rounded" />
                  <label htmlFor="hasExpiryForm" className="text-xs font-bold text-slate-500">Track expiry date for this batch</label>
                  {hasExpiry && <input type="date" required className="ml-4 px-4 py-2 rounded-xl border border-slate-200 text-sm font-normal focus:ring-2 focus:ring-[#3498db] outline-none shadow-sm" value={expiry} onChange={e => setExpiry(e.target.value)} />}
                </div>
                {/* Existing product summary */}
                {receiveMode === 'existing' && selectedProductKey && selectedRoomId && (() => {
                  const [sourceRoomId, ...rest] = selectedProductKey.split('|');
                  const sourceItemId = rest.join('|');
                  const sourceRoom = rooms.find(r => r.id === sourceRoomId);
                  const sourceItem = sourceRoom?.items.find(i => i.id === sourceItemId);
                  const targetRoom = rooms.find(r => r.id === selectedRoomId);
                  if (!sourceItem || !targetRoom) return null;

                  const matchInTarget = targetRoom.items.find(i =>
                    i.name.toLowerCase() === sourceItem.name.toLowerCase() &&
                    (i.brand || '').toLowerCase() === (sourceItem.brand || '').toLowerCase()
                  );

                  const incomingQty = receiveQty || 0;
                  const incomingPrice = receivePrice || 0;

                  if (!matchInTarget) {
                    return (
                      <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1 shadow-sm">
                        <div className="font-black text-slate-700 uppercase tracking-[0.15em] mb-1">Price Preview</div>
                        <div className="flex justify-between"><span>Adding to {targetRoom.name}:</span><span className="font-bold text-blue-600">{incomingQty} {sourceItem.uom} @ ${incomingPrice.toFixed(2)} = ${(incomingQty * incomingPrice).toFixed(2)}</span></div>
                        <div className="flex justify-between border-t border-slate-100 pt-1"><span>Status:</span><span className="font-black text-emerald-600">Will be added as NEW item in {targetRoom.name}</span></div>
                      </div>
                    );
                  }

                  const currentQty = matchInTarget.quantity;
                  const currentUnitPrice = matchInTarget.price;
                  const newQty = currentQty + incomingQty;
                  const newAvg = newQty > 0 ? ((currentQty * currentUnitPrice) + (incomingQty * incomingPrice)) / newQty : 0;

                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1 shadow-sm">
                      <div className="font-black text-slate-700 uppercase tracking-[0.15em] mb-1">Price Preview</div>
                      <div className="flex justify-between"><span>Current Stock in {targetRoom.name}:</span><span className="font-bold text-slate-800">{currentQty} {matchInTarget.uom} @ ${currentUnitPrice.toFixed(2)} = ${(currentQty * currentUnitPrice).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Adding:</span><span className="font-bold text-blue-600">{incomingQty} {matchInTarget.uom} @ ${incomingPrice.toFixed(2)} = ${(incomingQty * incomingPrice).toFixed(2)}</span></div>
                      <div className="flex justify-between border-t border-slate-100 pt-1"><span>After Receive:</span><span className="font-black text-emerald-600">{newQty} {matchInTarget.uom} @ ${newAvg.toFixed(2)} avg = ${(newQty * newAvg).toFixed(2)}</span></div>
                    </div>
                  );
                })()}

                {(receiveMode === 'new' || receiveMode === ('edit' as any)) && (
                  <div className="flex flex-col gap-6 animate-in slide-in-from-top-4 duration-300 pt-4 border-t border-slate-50">
                    <h5 className="text-[#3498db] font-black uppercase text-[10px] tracking-[0.2em] pb-1">
                      {receiveMode === ('edit' as any) ? 'Edit Product Registration' : 'New Product Registration'}
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Product Name *</label>
                        <input required placeholder="e.g. Dental Gloves" className="px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brand</label>
                        <input placeholder="e.g. 3M" className="px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Code/SKU</label>
                        <input placeholder="e.g. DG-001" className="px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">UOM</label>
                        <select className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-[#3498db] outline-none" value={formData.uom} onChange={e => setFormData({ ...formData, uom: e.target.value as UOM })}>
                          {UOMS.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Vendor</label>
                        <input placeholder="e.g. MedSupply Co" className="px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none" value={formData.vendor} onChange={e => setFormData({ ...formData, vendor: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Category</label>
                        <select className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-[#3498db] outline-none" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as Category })}>
                          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</label>
                      <textarea
                        rows={2}
                        placeholder="Product description or usage notes..."
                        className="px-4 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none resize-none"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                  <button type="submit" className="w-full md:w-auto bg-[#3498db] text-white px-10 py-4 rounded-2xl font-bold text-sm tracking-wider hover:bg-[#2980b9] shadow-sm shadow-blue-200 transition-all">
                    {receiveMode === ('edit' as any) ? 'Update Item' : 'Submit Entry'}
                  </button>
                  <button type="button" onClick={resetReceiveForm} className="w-full md:w-auto bg-slate-200 text-slate-600 px-10 py-4 rounded-2xl font-bold text-sm tracking-wider shadow-sm hover:bg-slate-300 transition-all">Reset Form</button>
                </div>
              </form>
            </div>
          )
        }

        {/* VIEW: PURCHASE HISTORY */}
        {
          activeTab === 'history' && (
            <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-3 rounded-2xl text-[#9b59b6]"><ClipboardList className="w-6 h-6" /></div>
                <h4 className="text-[#9b59b6] font-bold text-xl tracking-tight">Full Purchase Records</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-sm">
                <select value={historyCategory} onChange={e => setHistoryCategory(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 outline-none">
                  <option value="all">All Categories</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select value={historyVendor} onChange={e => setHistoryVendor(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 outline-none">
                  <option value="all">All Vendors</option>
                  {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <div className="md:col-span-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={e => setHistoryStartDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-600 outline-none"
                    />
                  </div>
                  <span className="text-slate-400 font-black px-1">-</span>
                  <div className="relative flex-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={e => setHistoryEndDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-600 outline-none"
                    />
                  </div>
                </div>
                <div className="md:col-span-2 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Search records..." className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-600 outline-none" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />
                </div>
              </div>
              <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 custom-scrollbar">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f8fafc] text-slate-500 font-black uppercase tracking-widest text-[9px] border-b border-slate-200">
                      <th className="px-6 py-5">Date</th>
                      <th className="px-6 py-5">Brand</th>
                      <th className="px-6 py-5">Product</th>
                      <th className="px-6 py-5">Code</th>
                      <th className="px-6 py-5 text-center">Qty</th>
                      <th className="px-6 py-5">UOM</th>
                      <th className="px-6 py-5">Price</th>
                      <th className="px-6 py-5">Total</th>
                      <th className="px-6 py-5">Vendor</th>
                      <th className="px-6 py-5">Category</th>
                      <th className="px-6 py-5">Expires</th>
                      <th className="px-6 py-5">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {groupedHistory.length > 0 ? groupedHistory.map(([month, items]) => (
                      <React.Fragment key={month}>
                        <tr className="bg-purple-50/50 border-y border-purple-100">
                          <td colSpan={12} className="px-6 py-3 text-[10px] font-black text-[#9b59b6] uppercase tracking-[0.2em]">{month}</td>
                        </tr>
                        {items.map(h => {
                          const currentRoom = rooms.find(r => r.id === h.roomId);
                          const displayLocation = currentRoom ? currentRoom.name : h.location;
                          const expiryDate = h.expiryDate ? new Date(h.expiryDate) : null;
                          const now = new Date();
                          const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                          const isExpired = expiryDate ? expiryDate < now : false;
                          const isExpiringSoon = expiryDate ? !isExpired && expiryDate <= soonThreshold : false;
                          return (
                            <tr key={h.id} className="hover:bg-purple-50/20 transition-colors">
                              <td className="px-6 py-4 text-slate-500 whitespace-nowrap text-xs">{formatDate(h.timestamp)}</td>
                              <td className="px-6 py-4 text-slate-500 text-xs">#{h.brand || '-'}</td>
                              <td className="px-6 py-4 text-slate-800">
                                <div className="font-bold">{h.productName}</div>
                                {h.description && (
                                  <div className="text-[10px] text-slate-500 italic mt-0.5">
                                    {h.description}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-slate-500 text-[10px]">{h.code || '-'}</td>
                              <td className="px-6 py-4 font-bold text-[#9b59b6] text-center">{h.qty}</td>
                              <td className="px-6 py-4 text-slate-600 font-medium text-xs capitalize">{h.uom || 'pcs'}</td>
                              <td className="px-6 py-4 text-slate-500 font-semibold">${h.unitPrice.toFixed(2)}</td>
                              <td className="px-6 py-4 text-[#c0392b] font-black tracking-tight">${h.totalPrice.toFixed(2)}</td>
                              <td className="px-6 py-4 text-slate-600 font-medium text-xs">{h.vendor || '-'}</td>
                              <td className="px-6 py-4"><span className="text-[10px] font-medium text-slate-500 capitalize tracking-wide">{h.category}</span></td>
                              <td className={`px-6 py-4 text-xs whitespace-nowrap ${isExpired ? 'text-rose-600 font-bold' : isExpiringSoon ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
                                {expiryDate ? (
                                  <>
                                    {expiryDate.toLocaleDateString('en-GB')}
                                    {isExpired && <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(EXP)</span>}
                                    {isExpiringSoon && <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(SOON)</span>}
                                  </>
                                ) : '-'}
                              </td>
                              <td className="px-6 py-4 text-emerald-600 font-bold text-[10px] whitespace-nowrap">{displayLocation}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    )) : (
                      <tr><td colSpan={12} className="py-24 text-center text-slate-300 font-black uppercase tracking-[0.3em] opacity-50">No Records Found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        }

        {/* VIEW: CLINIC ANALYTICS */}
        {
          activeTab === 'analytics' && (
            <ClinicAnalytics history={history} />
          )
        }

        {/* VIEW: EXPIRING ITEMS - NEW DESIGN */}
        {
          activeTab === 'expiring' && (
            <div className="flex flex-col gap-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-3 rounded-2xl text-[#f39c12]"><AlertTriangle className="w-6 h-6" /></div>
                <div>
                  <h4 className="text-[#f39c12] font-bold text-xl tracking-tight">Expirations Watchlist</h4>
                  <p className="text-xs text-slate-400 font-medium mt-1">Reviewing items past or nearing expiration date.</p>
                </div>
              </div>
              {expiringItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  {expiringItems.map((item) => {
                    const isExpired = new Date(item.expiryDate!) < new Date();
                    const daysDiff = getDaysDiff(item.expiryDate!);

                    return (
                      <div key={item.key} className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden shadow-sm flex flex-col group hover:shadow-md transition-shadow relative">
                        {/* Header Status Bar */}
                        <div className={`px-5 py-2.5 flex items-center justify-between ${isExpired ? 'bg-rose-50 border-t-4 border-t-rose-500' : 'bg-amber-50 border-t-4 border-t-amber-500'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`flex items-center gap-2 font-bold text-[11px] uppercase tracking-wider ${isExpired ? 'text-rose-600' : 'text-amber-600'}`}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {isExpired ? 'Expired Status' : 'Expiring Soon'}
                            </div>
                            <div className={`${isExpired ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'} px-3 py-1 rounded-full text-[10px] font-black tracking-tight`}>
                              {isExpired ? `${daysDiff}d ago` : `in ${Math.abs(daysDiff)}d`}
                            </div>
                          </div>
                          {!readOnly && (
                            <button
                              onClick={() => setDeleteTarget({ roomId: item.roomId, itemId: item.id, name: item.name, batchIndex: item.batchIndex, qty: item.qty, expiryDate: item.expiryDate })}
                              className="text-slate-300 hover:text-rose-600 transition-colors"
                              aria-label={`Delete ${item.name}`}
                              title="Delete item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Body Content */}
                        <div className="p-6 flex flex-col gap-6 flex-1">
                          <div className="flex flex-col gap-1">
                            <h5 className="font-bold text-slate-800 text-xl leading-tight">{item.name}</h5>
                            {/* BRAND / SKU FORMAT */}
                            <p className="text-sm font-medium text-slate-400">
                              {item.brand || 'No Brand'} / <span className="font-mono text-[11px] opacity-75">{item.code || 'NO-SKU'}</span>
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-8">
                            <div className="flex flex-col gap-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Calendar className="w-3 h-3" /> Expiration
                              </span>
                              <div className="flex flex-col">
                                <span className={`text-base font-black ${isExpired ? 'text-rose-600' : 'text-slate-700'}`}>
                                  {new Date(item.expiryDate!).toLocaleDateString('en-GB')}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 text-right items-end">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <MapIcon className="w-3 h-3" /> Location
                              </span>
                              <span className="text-base font-black text-slate-700">{item.roomName}</span>
                            </div>
                          </div>

                          <div className="h-px bg-slate-100 w-full" />

                          <div className="flex justify-between items-center">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty on hand</span>
                              <span className="text-base font-black text-slate-800">{item.qty} {item.uom || 'pcs'}</span>
                            </div>
                            <div className="flex flex-col gap-1 text-right">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Value</span>
                              <span className="text-base font-black text-slate-800">${(item.qty * item.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-32 opacity-20"><ClipboardCheck className="w-24 h-24 mb-6" /><p className="text-2xl font-black uppercase tracking-[0.3em] text-slate-400">All Items Fresh</p></div>
              )}
            </div>
          )
        }
      </div>

      {/* Global Activity Feed (Footer) */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 p-10 mt-6 mb-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-slate-800 p-3 rounded-2xl">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-lg font-extrabold text-slate-800 tracking-wider uppercase">Recent Global Activity</h4>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live System</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
          {logs.length > 0 ? logs.map((log) => (
            <div key={log.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 bg-slate-50/30 rounded-3xl border border-transparent hover:border-slate-200 hover:bg-white group transition-all duration-300">
              <div className="flex items-start gap-5">
                <div className={`mt-1 p-3 rounded-2xl shadow-sm transition-transform group-hover:scale-110 duration-300 ${log.action === 'receive' || log.action === 'add' || log.action === 'transfer_in'
                  ? 'bg-emerald-100 text-emerald-600'
                  : log.action === 'remove' || log.action === 'delete' || log.action === 'transfer_out'
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-blue-100 text-blue-600'
                  }`}>
                  {log.action === 'receive' || log.action === 'add' || log.action === 'transfer_in' ? (
                    <Plus className="w-5 h-5" />
                  ) : log.action === 'remove' || log.action === 'delete' || log.action === 'transfer_out' ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    <RefreshCcw className="w-5 h-5" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100/50">
                      {log.roomName}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${log.action === 'receive' || log.action === 'add' || log.action === 'transfer_in'
                      ? 'bg-emerald-50 text-emerald-700'
                      : log.action === 'remove' || log.action === 'delete' || log.action === 'transfer_out'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-blue-50 text-blue-700'
                      }`}>
                      {log.action.replace('_', ' ')}
                    </span>
                    {log.actorName && (
                      <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md font-bold shadow-sm">
                        By {log.actorName}
                      </span>
                    )}
                  </div>
                  <p className="text-[15px] font-bold text-slate-700 leading-snug group-hover:text-slate-900 transition-colors">
                    {log.details}
                  </p>

                  {log.beforeValue !== undefined && log.afterValue !== undefined && (
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-slate-100 px-3 py-1.5 rounded-xl shadow-sm">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Delta</span>
                        <span className="text-[12px] font-bold text-slate-400 line-through decoration-slate-300">{log.beforeValue}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                        <span className={`text-[12px] font-black ${Number(log.afterValue) > Number(log.beforeValue) ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                          {log.afterValue}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 mt-4 sm:mt-0 text-right shrink-0 bg-white/50 sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-slate-100 sm:border-none w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-slate-700" />
                  <p className="text-[13px] font-extrabold tracking-wider">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  <p className="text-[12px] font-bold">{new Date(log.timestamp).toLocaleDateString('en-GB')}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="flex flex-col items-center justify-center py-24 bg-slate-50/30 rounded-[2.5rem] border border-dashed border-slate-200">
              <History className="w-16 h-16 text-slate-200 mb-6" />
              <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-300">Awaiting Clinic Activity</p>
            </div>
          )}
        </div>
      </div>

      {
        deleteTarget && (
          <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
              <div>
                <p className="text-[18px] font-semibold text-slate-700">
                  {typeof deleteTarget.batchIndex === 'number'
                    ? `Delete batch ${deleteTarget.batchIndex + 1} of "${deleteTarget.name}"?`
                    : `Delete "${deleteTarget.name}" from inventory?`}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {typeof deleteTarget.batchIndex === 'number'
                    ? `Qty: ${deleteTarget.qty ?? 0} ${deleteTarget.expiryDate ? `| Exp: ${deleteTarget.expiryDate}` : ''}`
                    : 'This action cannot be undone.'}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (typeof deleteTarget.batchIndex === 'number') {
                      const delta = -(deleteTarget.qty || 0);
                      onUpdateBatchQty?.(deleteTarget.roomId, deleteTarget.itemId, deleteTarget.batchIndex, delta);
                    } else {
                      onDeleteItem?.(deleteTarget.roomId, deleteTarget.itemId);
                    }
                    setDeleteTarget(null);
                  }}
                  className="px-4 py-2 rounded-full bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
};

export default MasterInventory;
