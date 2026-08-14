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
  Clock,
  SlidersHorizontal,
  Tag,
  Truck,
  Layers,
  MapPin,
  Check,
} from 'lucide-react';
import { Room, Item, ActivityLog, PurchaseHistory, Category, UOM, ItemBatch, TBA_ROOM_ID, TBA_ROOM_NAME } from './types';
import { CATEGORIES, UOMS } from './constants';
import ClinicAnalytics from './ClinicAnalytics';
import { getPurchaseHistoryLocation, isArchivedPurchaseHistory } from './src/utils/roomDeletion';

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
  onRestoreRoom?: (roomName: string, itemSnapshot?: string) => void;
  onAssignTbaItem?: (itemId: string, toRoomId: string) => void;
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
  onRestoreRoom,
  onAssignTbaItem,
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
  const [isQtyEditMode, setIsQtyEditMode] = useState(false);

  // TBA items — from the virtual unassigned room, shown separately
  // Max qty per item = total ever received from purchase history (name+code key)
  // Used to cap the + button so qty never exceeds what was originally purchased.
  const maxQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    history.forEach(h => {
      const key = `${h.productName}|${h.code || ''}`;
      map.set(key, (map.get(key) || 0) + h.qty);
    });
    return map;
  }, [history]);

  const getMaxQty = (item: { name: string; code: string }) => {
    const key = `${item.name}|${item.code || ''}`;
    return maxQtyMap.get(key) ?? Infinity; // Infinity = no history found, allow free editing
  };

  const tbaItems = useMemo(() =>
    (rooms.find(r => r.id === TBA_ROOM_ID)?.items ?? [])
      .map(item => ({ ...item, roomName: TBA_ROOM_NAME, roomId: TBA_ROOM_ID })),
    [rooms]
  );

  // Flattened items for the master list (excludes TBA virtual room)
  const allItems = useMemo(() => {
    return rooms
      .filter(room => room.id !== TBA_ROOM_ID)
      .flatMap(room =>
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

  const inventoryLocations = useMemo(() => rooms.filter(r => r.id !== TBA_ROOM_ID).map(r => ({ id: r.id, name: r.name })), [rooms]);

  const [openBatchRows, setOpenBatchRows] = useState<Record<string, boolean>>({});
  const toggleBatchRow = (key: string) => {
    setOpenBatchRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const [openDetailRows, setOpenDetailRows] = useState<Record<string, boolean>>({});
  const toggleDetailRow = (key: string) => {
    setOpenDetailRows(prev => {
      const newState = !prev[key];
      // If we are closing the detail row, also close the batch row
      if (!newState) {
        setOpenBatchRows(prevBatch => {
          if (!prevBatch[key]) return prevBatch;
          const newBatch = { ...prevBatch };
          delete newBatch[key];
          return newBatch;
        });
      }
      return { ...prev, [key]: newState };
    });
  };

  const [showFilters, setShowFilters] = useState(false);

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
      purchaseDate?: string;
      description?: string;
      qty: number;
      price: number;
      uom?: string;
      batchIndex: number;
      vendor?: string;
      category?: string;
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
            // Try to find purchase date from history
            const matchedHistory = history.find(h =>
              h.productName === item.name &&
              h.brand === item.brand &&
              h.code === item.code &&
              h.expiryDate === b.expiryDate
            );

            entries.push({
              key: `${room.id}-${item.id}-${idx}`,
              id: item.id,
              roomId: room.id,
              roomName: room.name,
              name: item.name,
              brand: item.brand,
              code: item.code,
              expiryDate: b.expiryDate,
              purchaseDate: matchedHistory ? matchedHistory.timestamp : (item as any).createdAt,
              description: item.description,
              qty: b.qty,
              price: b.unitPrice,
              uom: item.uom,
              batchIndex: idx,
              vendor: item.vendor,
              category: item.category
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
      <div className="flex items-center justify-between bg-white rounded-none md:rounded-2xl shadow-sm border-x-0 md:border border-slate-100 p-1 pb-0 md:p-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`relative flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-1 md:px-6 pt-2 pb-3 md:py-3 rounded-none md:rounded-xl font-bold text-[11px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'all' ? 'md:bg-[#4d9678] md:text-white md:shadow-md text-[#4d9678]' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <ClipboardList className="w-5 h-5 md:w-4 md:h-4" />
            <span className="hidden md:inline">All Inventory</span>
            <span className="md:hidden">Inventory</span>
            <div className={`absolute bottom-0 left-0 right-0 h-[3px] md:hidden transition-all duration-300 ${activeTab === 'all' ? 'bg-[#4d9678] scale-x-100' : 'bg-transparent scale-x-0'}`} />
          </button>
          {!readOnly && (
            <button
              onClick={() => setActiveTab('receive')}
              className={`relative flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-1 md:px-6 pt-2 pb-3 md:py-3 rounded-none md:rounded-xl font-bold text-[11px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'receive' ? 'md:bg-[#3498db] md:text-white md:shadow-md text-[#3498db]' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Package className="w-5 h-5 md:w-4 md:h-4" />
              <span className="hidden md:inline">Receive Stock</span>
              <span className="md:hidden">Receive</span>
              <div className={`absolute bottom-0 left-0 right-0 h-[3px] md:hidden transition-all duration-300 ${activeTab === 'receive' ? 'bg-[#3498db] scale-x-100' : 'bg-transparent scale-x-0'}`} />
            </button>
          )}
          <button
            onClick={() => setActiveTab('history')}
            className={`relative flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-1 md:px-6 pt-2 pb-3 md:py-3 rounded-none md:rounded-xl font-bold text-[11px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'history' ? 'md:bg-[#9b59b6] md:text-white md:shadow-md text-[#9b59b6]' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <History className="w-5 h-5 md:w-4 md:h-4" />
            <span className="hidden md:inline">Purchase History</span>
            <span className="md:hidden">History</span>
            <div className={`absolute bottom-0 left-0 right-0 h-[3px] md:hidden transition-all duration-300 ${activeTab === 'history' ? 'bg-[#9b59b6] scale-x-100' : 'bg-transparent scale-x-0'}`} />
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`relative flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-1 md:px-6 pt-2 pb-3 md:py-3 rounded-none md:rounded-xl font-bold text-[11px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'analytics' ? 'md:bg-indigo-600 md:text-white md:shadow-md text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <BarChart3 className="w-5 h-5 md:w-4 md:h-4" />
            <span className="hidden md:inline">Usage Stats</span>
            <span className="md:hidden">Stats</span>
            <div className={`absolute bottom-0 left-0 right-0 h-[3px] md:hidden transition-all duration-300 ${activeTab === 'analytics' ? 'bg-indigo-600 scale-x-100' : 'bg-transparent scale-x-0'}`} />
          </button>
          <button
            onClick={() => setActiveTab('expiring')}
            className={`relative flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-1 md:px-6 pt-2 pb-3 md:py-3 rounded-none md:rounded-xl font-bold text-[11px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'expiring' ? 'md:bg-[#f39c12] md:text-white md:shadow-md text-[#f39c12]' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <AlertTriangle className="w-5 h-5 md:w-4 md:h-4" />
            <div className="flex items-center gap-1">
              <span className="hidden md:inline">Expiring Items</span>
              <span className="md:hidden">Expiring</span>
              {expiringItems.length > 0 && <span className={`flex h-4 w-4 md:h-5 md:w-5 items-center justify-center rounded-full text-[8px] md:text-[10px] font-black ${activeTab === 'expiring' ? 'md:bg-white md:text-[#f39c12] bg-[#f39c12] text-white' : 'bg-[#f39c12] text-white'}`}>{expiringItems.length}</span>}
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-[3px] md:hidden transition-all duration-300 ${activeTab === 'expiring' ? 'bg-[#f39c12] scale-x-100' : 'bg-transparent scale-x-0'}`} />
          </button>
        </div>
        <div className="hidden md:flex px-4 border-l border-slate-100">
          <button onClick={downloadAllPdf} className="text-slate-400 hover:text-[#4d9678] transition-colors p-2 rounded-lg" title="Export All Data">
            <FileDown className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="bg-white rounded-none md:rounded-[2rem] shadow-xl overflow-hidden border-x-0 md:border border-slate-100 px-4 py-6 md:p-8 min-h-[500px]">

        {/* VIEW: ALL INVENTORY */}
        {
          activeTab === 'all' && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 p-3 rounded-2xl text-[#4d9678]"><ClipboardList className="w-6 h-6" /></div>
                  <h4 className="text-[#4d9678] font-bold text-xl tracking-tight">All Inventory</h4>
                </div>
                {!readOnly && onUpdateQty && (
                  <button
                    onClick={() => setIsQtyEditMode(v => !v)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      isQtyEditMode
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    title={isQtyEditMode ? 'Lock quantities' : 'Edit quantities'}
                  >
                    {isQtyEditMode ? <Check className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                    {isQtyEditMode ? 'Done Editing' : 'Edit Qty'}
                  </button>
                )}
              </div>
              {/* FILTER AREA */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-sm animate-in slide-in-from-top-2 duration-500">

                {/* Category Filter */}
                <div className="relative group">
                  <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                  <select
                    value={inventoryCategory}
                    onChange={e => setInventoryCategory(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-[#4d9678] transition-colors cursor-pointer appearance-none"
                  >
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-slate-400 rotate-45" />
                  </div>
                </div>

                {/* Vendor Filter */}
                <div className="relative group">
                  <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                  <select
                    value={inventoryVendor}
                    onChange={e => setInventoryVendor(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-[#4d9678] transition-colors cursor-pointer appearance-none"
                  >
                    <option value="all">All Vendors</option>
                    {uniqueInventoryVendors.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-slate-400 rotate-45" />
                  </div>
                </div>

                {/* Location Filter */}
                <div className="relative group">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
                  <select
                    value={inventoryLocation}
                    onChange={e => setInventoryLocation(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-[#4d9678] transition-colors cursor-pointer appearance-none"
                  >
                    <option value="all">All Locations</option>
                    {inventoryLocations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-slate-400 rotate-45" />
                  </div>
                </div>

                <div className="md:col-span-2 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search records..."
                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-[#4d9678]/10 focus:border-[#4d9678] transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* ── TBA Section — items whose room was deleted ─────────────────── */}
              {tbaItems.length > 0 && (
                <div className="border-2 border-amber-300 rounded-2xl overflow-hidden bg-amber-50/40">
                  <div className="flex items-center gap-3 px-4 py-3 bg-amber-100/80 border-b border-amber-200">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-amber-800 font-black text-xs uppercase tracking-widest">
                      Unassigned Items (TBA) — {tbaItems.length} item{tbaItems.length !== 1 ? 's' : ''} need a room
                    </span>
                  </div>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-amber-50 text-amber-700 font-black uppercase tracking-widest text-[9px] border-b border-amber-200">
                      <tr>
                        <th className="px-3 py-3 w-[200px]">Product</th>
                        <th className="px-3 py-3 w-[80px]">Code</th>
                        <th className="px-3 py-3 w-[60px]">Qty</th>
                        <th className="px-3 py-3 w-[60px]">UOM</th>
                        <th className="px-3 py-3 w-[80px]">Price</th>
                        <th className="px-3 py-3 w-[140px]">Vendor</th>
                        <th className="px-3 py-3">Assign to Room</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {tbaItems.map(item => (
                        <tr key={item.id} className="bg-white/60 hover:bg-amber-50/60 transition-colors">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wider shrink-0">TBA</span>
                              <span className="font-semibold text-slate-800 truncate" title={item.name}>{item.name}</span>
                            </div>
                            {item.brand && <p className="text-slate-400 text-[10px] mt-0.5 pl-8">{item.brand}</p>}
                          </td>
                          <td className="px-3 py-3 text-slate-500 font-mono text-[10px]">{item.code || '—'}</td>
                          <td className="px-3 py-3 font-bold text-slate-700">{item.quantity}</td>
                          <td className="px-3 py-3 text-slate-500">{item.uom}</td>
                          <td className="px-3 py-3 text-slate-700">${item.price.toFixed(2)}</td>
                          <td className="px-3 py-3 text-slate-500 truncate" title={item.vendor}>{item.vendor || '—'}</td>
                          <td className="px-3 py-3">
                            {onAssignTbaItem && rooms.filter(r => r.id !== TBA_ROOM_ID).length > 0 ? (
                              <select
                                defaultValue=""
                                onChange={e => {
                                  if (e.target.value) onAssignTbaItem(item.id, e.target.value);
                                }}
                                className="text-[11px] font-semibold border border-amber-300 rounded-lg px-2 py-1.5 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 hover:border-amber-400 transition-colors"
                              >
                                <option value="" disabled>Select a room…</option>
                                {rooms.filter(r => r.id !== TBA_ROOM_ID).map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-amber-600 text-[10px] font-semibold italic">No rooms — add a room first</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
                      <th className="w-8"></th>
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
                                    <div className="flex items-center justify-center gap-1.5">
                                      {(!readOnly && onUpdateQty && isQtyEditMode) ? (
                                        <>
                                          <button
                                            onClick={() => onUpdateQty(item.roomId, item.id, -1)}
                                            disabled={item.quantity <= 0}
                                            className={`w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${item.quantity <= 0 ? 'text-slate-200 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'}`}
                                            aria-label="Decrease quantity"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>
                                          <span className="min-w-[24px] text-center font-bold text-slate-800 text-xs">
                                            {item.quantity}
                                          </span>
                                          <button
                                            onClick={() => {
                                              const max = getMaxQty(item);
                                              if (item.quantity < max) onUpdateQty(item.roomId, item.id, 1);
                                            }}
                                            disabled={item.quantity >= getMaxQty(item)}
                                            className={`w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${item.quantity >= getMaxQty(item) ? 'text-slate-200 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-emerald-500'}`}
                                            aria-label="Increase quantity"
                                            title={item.quantity >= getMaxQty(item) ? `Max quantity reached (${getMaxQty(item)} purchased)` : `Increase quantity (max: ${getMaxQty(item)})`}
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </>
                                      ) : (
                                        <span className="font-bold text-slate-800 text-center text-xs">{item.quantity}</span>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-3 py-4 text-slate-600 font-medium text-xs capitalize whitespace-nowrap">
                                    {item.uom}
                                  </td>

                                  <td className="px-3 py-4 text-slate-500 font-semibold whitespace-nowrap">
                                    ${item.price.toFixed(2)}
                                  </td>

                                  <td className="px-3 py-4 font-bold text-slate-800 tracking-tight whitespace-nowrap">
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
                                    <select
                                      value={item.roomId}
                                      disabled={rooms.length <= 1 || !onTransfer}
                                      onChange={(e) => {
                                        const toRoomId = e.target.value;
                                        if (toRoomId && toRoomId !== item.roomId && onTransfer) {
                                          onTransfer(item.roomId, toRoomId, item.id, item.quantity);
                                        }
                                      }}
                                      className="text-emerald-600 font-bold text-[10px] whitespace-nowrap border border-emerald-100 px-2 py-0.5 rounded-lg bg-emerald-50/30 cursor-pointer appearance-none hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-colors max-w-[110px] truncate disabled:cursor-default disabled:opacity-80"
                                      title={rooms.length <= 1 ? item.roomName : `Move from ${item.roomName}`}
                                    >
                                      {rooms.filter(r => r.id !== TBA_ROOM_ID).map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* Delete button — only visible in edit mode */}
                                  <td className="px-2 py-4 w-8">
                                    {isQtyEditMode && !readOnly && onDeleteItem && (
                                      <button
                                        onClick={() => setDeleteTarget({ roomId: item.roomId, itemId: item.id, name: item.name })}
                                        className="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                                        aria-label={`Delete ${item.name}`}
                                        title={`Delete "${item.name}"`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
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
                      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-4 py-2 border-y border-emerald-100 text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">
                        {category}
                      </div>
                      {(items as any[]).map((item) => {
                        const batchKey = `${item.roomId}-${item.id}`;
                        const isDetailOpen = openDetailRows[batchKey];
                        const batches = item.batches && item.batches.length ? item.batches : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
                        const isOpen = !!openBatchRows[batchKey];

                        // Calculate earliest expiry
                        const expiryDates = batches.map((b: any) => b.expiryDate ? new Date(b.expiryDate) : null).filter(Boolean);
                        const minExpiry = expiryDates.length > 0 ? new Date(Math.min(...expiryDates.map(d => d.getTime()))) : (item.expiryDate ? new Date(item.expiryDate) : null);

                        const now = new Date();
                        const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                        const isExpired = minExpiry ? minExpiry < now : false;
                        const isExpiringSoon = minExpiry ? !isExpired && minExpiry <= soonThreshold : false;


                        const hasDetails = batches.length > 1;

                        return (
                          <div
                            key={batchKey}
                            onClick={() => hasDetails && toggleDetailRow(batchKey)}
                            className={`bg-white rounded-2xl border transition-all duration-300 select-none ${hasDetails ? 'cursor-pointer' : 'cursor-default'} ${isDetailOpen ? 'border-emerald-200 ring-4 ring-emerald-50 shadow-md' : 'border-slate-100 shadow-sm'} overflow-hidden`}
                          >
                            <div className="p-4 flex flex-col gap-3">
                              <div className="flex justify-between items-start">
                                <div className="flex-1 pr-2">
                                  <div className="font-bold text-slate-800 text-sm leading-tight mb-1">{item.name}</div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                                    <span className="font-medium">#{item.brand || 'No Brand'}</span>
                                    {item.code && (
                                      <>
                                        <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                                        <span className="font-mono text-slate-500">{item.code}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span className="text-emerald-600 font-black tracking-tight text-sm">
                                    ${(item.quantity * item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[9px] text-slate-400 font-medium">${item.price.toFixed(2)}/{item.uom || 'ea'}</span>
                                </div>
                              </div>

                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/50 space-y-3">
                                <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-[11px]">
                                  <div>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Quantity</span>
                                    {batches.length <= 1 && !readOnly && onUpdateBatchQty ? (
                                      <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 w-fit shadow-sm">
                                        <button onClick={(e) => { e.stopPropagation(); const b = batches[0]; b.qty > 0 && onUpdateBatchQty(item.roomId, item.id, 0, -1); }} className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-95 hover:text-rose-500"><Minus className="w-3 h-3" /></button>
                                        <span className="w-8 text-center text-[10px] font-black text-slate-700">{item.quantity}</span>
                                        <button onClick={(e) => { e.stopPropagation(); const b = batches[0]; onUpdateBatchQty(item.roomId, item.id, 0, 1); }} className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-95 hover:text-emerald-500"><Plus className="w-3 h-3" /></button>
                                      </div>
                                    ) : (
                                      <span className="font-bold text-emerald-600">{item.quantity} {item.uom || 'units'}</span>
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Expires</span>
                                    <div className="flex items-center gap-1.5 align-baseline">
                                      <span className={`font-bold ${isExpired ? 'text-rose-600' : isExpiringSoon ? 'text-amber-600' : 'text-slate-600'}`}>
                                        {minExpiry ? (
                                          <>
                                            {minExpiry.toLocaleDateString('en-GB')}
                                            {isExpired && <span className="ml-1 text-[8px] uppercase tracking-tight font-black bg-rose-100 text-rose-600 px-1 py-px rounded">(EXP)</span>}
                                            {isExpiringSoon && <span className="ml-1 text-[8px] uppercase tracking-tight font-black bg-amber-100 text-amber-600 px-1 py-px rounded">(SOON)</span>}
                                          </>
                                        ) : 'No Date'}
                                      </span>
                                      {batches.length > 1 && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); toggleDetailRow(batchKey); }}
                                          className="text-[10px] text-blue-500 font-bold hover:underline"
                                        >
                                          {isDetailOpen ? 'Hide' : 'View'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Vendor</span>
                                    <span className="font-medium text-slate-600 truncate block">{item.vendor || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Location</span>
                                    <span className="font-medium text-emerald-600 truncate block">{item.roomName}</span>
                                  </div>
                                </div>

                                {/* Description - Integrated */}
                                {item.description && (
                                  <div>
                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</div>
                                    <p className="text-[11px] text-slate-600 italic leading-relaxed">{item.description}</p>
                                  </div>
                                )}
                              </div>


                            </div>

                            {/* Expanded Details Area (Reused Logic but Simplified Wrapper) */}
                            {hasDetails && isDetailOpen && (
                              <div className="px-4 pb-4 space-y-4 pt-4 bg-slate-50/50">
                                {/* Batches Section */}
                                {batches.length > 1 && (
                                  <div className="space-y-2">
                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest pb-2">Batch Management</div>
                                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                      {batches.map((b: any, bIdx: number) => {
                                        const bExpDate = b.expiryDate ? new Date(b.expiryDate) : null;
                                        const bExp = bExpDate ? bExpDate < now : false;
                                        const bSoon = bExpDate ? !bExp && bExpDate <= soonThreshold : false;
                                        return (
                                          <div key={bIdx} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm flex items-center justify-between gap-3">
                                            <div className="shrink-0">
                                              {!readOnly && onUpdateBatchQty ? (
                                                <div className="flex items-center bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                                                  <button onClick={() => b.qty > 0 && onUpdateBatchQty(item.roomId, item.id, bIdx, -1)} className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-95"><Minus className="w-2.5 h-2.5" /></button>
                                                  <span className="w-8 text-center text-xs font-black text-slate-700">{b.qty}</span>
                                                  <button onClick={() => onUpdateBatchQty(item.roomId, item.id, bIdx, 1)} className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-95"><Plus className="w-2.5 h-2.5" /></button>
                                                </div>
                                              ) : <span className="font-bold text-slate-700">{b.qty}</span>}
                                            </div>
                                            <div className="flex flex-wrap justify-end items-baseline gap-x-5 gap-y-1 text-right">
                                              <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
                                                ${(b.unitPrice || item.price || 0).toFixed(2)}/{item.uom || 'ea'}
                                              </div>
                                              <div className="text-sm font-bold text-slate-800 whitespace-nowrap">
                                                ${((b.qty || 0) * (b.unitPrice || item.price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                              </div>
                                              <div className={`text-sm font-bold whitespace-nowrap ${bExp ? 'text-rose-500' : bSoon ? 'text-amber-500' : 'text-slate-500'}`}>
                                                {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-GB') : 'No Exp'}
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
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
                      {rooms.filter(r => r.id !== TBA_ROOM_ID).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
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
            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
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
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100 custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-[#f8fafc] text-slate-500 font-black uppercase tracking-widest text-[9px] border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-5 w-[90px]">Date</th>
                      <th className="px-3 py-5 w-[100px]">Brand</th>
                      <th className="px-3 py-5 min-w-[240px]">Product</th>
                      <th className="px-3 py-5 w-[60px]">Code</th>
                      <th className="px-3 py-5 w-[90px] text-right">Qty / UOM</th>
                      <th className="px-3 py-5 w-[80px]">Price</th>
                      <th className="px-3 py-5 w-[90px]">Total</th>
                      <th className="px-3 py-5 w-[100px]">Vendor</th>
                      <th className="px-3 py-5 w-[100px]">Category</th>
                      <th className="px-3 py-5 w-[90px]">Expires</th>
                      <th className="px-3 py-5 w-[110px]">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {groupedHistory.length > 0 ? groupedHistory.map(([month, items]) => (
                      <React.Fragment key={month}>
                        <tr className="bg-slate-100/70 border-y border-slate-200">
                          <td colSpan={11} className="px-6 py-3 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">{month}</td>
                        </tr>
                        {items.map(h => {
                          const currentRoom = rooms.find(r => r.id === h.roomId);
                          const displayLocation = getPurchaseHistoryLocation(h, currentRoom?.name);
                          const isArchivedLocation = isArchivedPurchaseHistory(h);
                          const expiryDate = h.expiryDate ? new Date(h.expiryDate) : null;
                          const now = new Date();
                          const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                          const isExpired = expiryDate ? expiryDate < now : false;
                          const isExpiringSoon = expiryDate ? !isExpired && expiryDate <= soonThreshold : false;
                          return (
                            <tr key={h.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-3 py-4 text-slate-500 whitespace-nowrap text-xs">{formatDate(h.timestamp)}</td>
                              <td className="px-3 py-4 text-slate-500 text-xs">#{h.brand || '-'}</td>
                              <td className="px-3 py-4 text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                <div className="font-bold truncate max-w-[400px]" title={h.productName}>{h.productName}</div>
                                {h.description && (
                                  <div className="text-[10px] text-slate-500 italic mt-0.5 truncate max-w-[400px]" title={h.description}>
                                    {h.description}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-4 text-slate-500 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">{h.code || '-'}</td>
                              <td className="px-3 py-4 text-right tabular-nums">
                                <span className="font-bold text-slate-800 text-xs">{h.qty}</span>
                                <span className="ml-1 text-[9px] font-medium text-slate-400 uppercase">{h.uom || 'pcs'}</span>
                              </td>
                              <td className="px-3 py-4 text-slate-500 font-semibold whitespace-nowrap text-xs">${h.unitPrice.toFixed(2)}</td>
                              <td className="px-3 py-4 text-slate-800 font-bold tracking-tight whitespace-nowrap text-xs">${h.totalPrice.toFixed(2)}</td>
                              <td className="px-3 py-4 text-slate-600 font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis">{h.vendor || '-'}</td>
                              <td className="px-3 py-4"><span className="text-[10px] font-medium text-slate-500 capitalize tracking-wide">{h.category}</span></td>
                              <td className={`px-3 py-4 text-xs whitespace-nowrap ${isExpired ? 'text-rose-600 font-bold' : isExpiringSoon ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
                                {expiryDate ? (
                                  <>
                                    {expiryDate.toLocaleDateString('en-GB')}
                                    {isExpired && <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(EXP)</span>}
                                    {isExpiringSoon && <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(SOON)</span>}
                                  </>
                                ) : '-'}
                              </td>
                              <td className="px-3 py-4">
                                <span className={`font-bold text-[10px] whitespace-nowrap border px-2 py-0.5 rounded-lg ${isArchivedLocation ? 'text-slate-500 border-slate-200 bg-slate-100/70' : 'text-emerald-600 border-emerald-100 bg-emerald-50/30'}`}>
                                  {displayLocation}
                                </span>
                              </td>
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

              {/* MOBILE CARD VIEW */}
              <div className="md:hidden space-y-6">
                {groupedHistory.length > 0 ? groupedHistory.map(([month, items]) => (
                  <div key={month} className="space-y-3">
                    <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm px-4 py-2 border-y border-purple-100 text-[10px] font-black text-[#9b59b6] uppercase tracking-[0.2em]">
                      {month}
                    </div>
                    {items.map(h => {
                      const currentRoom = rooms.find(r => r.id === h.roomId);
                      const displayLocation = getPurchaseHistoryLocation(h, currentRoom?.name);
                      const isArchivedLocation = isArchivedPurchaseHistory(h);
                      const expiryDate = h.expiryDate ? new Date(h.expiryDate) : null;
                      const now = new Date();
                      const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                      const isExpired = expiryDate ? expiryDate < now : false;
                      const isExpiringSoon = expiryDate ? !isExpired && expiryDate <= soonThreshold : false;

                      return (
                        <div key={h.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 pr-2">
                              <div className="font-bold text-slate-800 text-sm leading-tight mb-1">{h.productName}</div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="font-medium">#{h.brand || 'No Brand'}</span>
                                {h.code && (
                                  <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                                    <span className="font-mono text-slate-500">{h.code}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className="text-[#c0392b] font-black tracking-tight text-sm">${h.totalPrice.toFixed(2)}</span>
                              <span className="text-[9px] text-slate-400 font-medium">${h.unitPrice.toFixed(2)} / {h.uom || 'unit'}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Quantity</span>
                              <span className="font-bold text-[#9b59b6]">{h.qty} {h.uom || 'pcs'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Date</span>
                              <span className="font-medium text-slate-600">{formatDate(h.timestamp)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Category</span>
                              <span className="font-medium text-slate-600 capitalize">{h.category || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Expires</span>
                              <span className={`font-bold ${isExpired ? 'text-rose-600' : isExpiringSoon ? 'text-amber-600' : 'text-slate-600'}`}>
                                {expiryDate ? (
                                  <>
                                    {expiryDate.toLocaleDateString('en-GB')}
                                    {isExpired && <span className="ml-1 text-[8px] uppercase tracking-tight font-black bg-rose-100 text-rose-600 px-1 py-px rounded">(EXP)</span>}
                                    {isExpiringSoon && <span className="ml-1 text-[8px] uppercase tracking-tight font-black bg-amber-100 text-amber-600 px-1 py-px rounded">(SOON)</span>}
                                  </>
                                ) : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Vendor</span>
                              <span className="font-medium text-slate-600 truncate block">{h.vendor || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Location</span>
                              <span className={`font-medium truncate block ${isArchivedLocation ? 'text-slate-500' : 'text-emerald-600'}`}>{displayLocation}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <History className="w-12 h-12 text-slate-200 mb-4" />
                    <span className="text-slate-300 font-black uppercase tracking-[0.2em] text-sm opacity-50">No Records Found</span>
                  </div>
                )}
              </div>
            </div>
          )
        }

        {/* VIEW: CLINIC ANALYTICS */}
        {
          activeTab === 'analytics' && (
            <ClinicAnalytics history={history} inventory={rooms.filter(r => r.id !== TBA_ROOM_ID).flatMap(r => r.items)} />
          )
        }

        {/* VIEW: EXPIRING ITEMS - TABLE DESIGN */}
        {
          activeTab === 'expiring' && (
            <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-3 rounded-2xl text-[#f39c12]"><AlertTriangle className="w-6 h-6" /></div>
                <div>
                  <h4 className="text-[#f39c12] font-bold text-xl tracking-tight">Expirations Watchlist</h4>
                </div>
              </div>
              {expiringItems.length > 0 ? (
                <>
                  {/* DESKTOP TABLE VIEW */}
                  <div className="hidden md:block border border-slate-200 rounded-2xl overflow-hidden shadow-sm custom-scrollbar">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-[#f8fafc] text-slate-500 font-black uppercase tracking-widest text-[9px] border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-5 w-[100px]">Brand</th>
                            <th className="px-3 py-5 min-w-[240px]">Product</th>
                            <th className="px-3 py-5 w-[60px]">Code</th>
                            <th className="px-3 py-5 w-[90px] text-right">Qty / UOM</th>
                            <th className="px-3 py-5 w-[80px] text-right">Price</th>
                            <th className="px-3 py-5 w-[90px] text-right">Total</th>
                            <th className="px-3 py-5 w-[110px]">Location</th>
                            <th className="px-3 py-5 w-[90px] text-right">Purchased</th>
                            <th className="px-3 py-5 w-[100px] text-right">Expires</th>
                            <th className="px-3 py-5 w-[80px]">Status</th>
                            {!readOnly && <th className="w-12 px-3 py-5"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {expiringItems.map((item) => {
                            const isExpired = new Date(item.expiryDate!) < new Date();
                            const daysDiff = getDaysDiff(item.expiryDate!);

                            return (
                              <tr key={item.key} className="hover:bg-slate-50/60 transition-colors">
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
                                <td className="px-3 py-4 text-right tabular-nums">
                                  <span className="font-bold text-slate-800 text-xs">{item.qty}</span>
                                  <span className="ml-1 text-[9px] font-medium text-slate-400 uppercase">{item.uom || 'pcs'}</span>
                                </td>
                                <td className="px-3 py-4 text-right text-slate-500 font-semibold whitespace-nowrap text-xs">
                                  ${item.price.toFixed(2)}
                                </td>
                                <td className="px-3 py-4 text-right font-bold text-slate-800 tracking-tight whitespace-nowrap text-xs">
                                  ${(item.qty * item.price).toFixed(2)}
                                </td>
                                <td className="px-3 py-4">
                                  <select
                                    value={item.roomId}
                                    disabled={rooms.length <= 1 || !onTransfer}
                                    onChange={(e) => {
                                      const toRoomId = e.target.value;
                                      if (toRoomId && toRoomId !== item.roomId && onTransfer) {
                                        onTransfer(item.roomId, toRoomId, item.id, item.qty);
                                      }
                                    }}
                                    className="text-emerald-600 font-bold text-[10px] whitespace-nowrap border border-emerald-100 px-2 py-0.5 rounded-lg bg-emerald-50/30 cursor-pointer appearance-none hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-colors max-w-[110px] truncate disabled:cursor-default disabled:opacity-80"
                                    title={rooms.length <= 1 ? item.roomName : `Move from ${item.roomName}`}
                                  >
                                    {rooms.filter(r => r.id !== TBA_ROOM_ID).map(r => (
                                      <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-4 text-right text-slate-500 text-xs whitespace-nowrap">
                                  {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString('en-GB') : '-'}
                                </td>
                                <td className="px-3 py-4 text-right whitespace-nowrap tabular-nums">
                                  <span className={`text-xs font-bold ${isExpired ? 'text-rose-600' : 'text-amber-600'}`}>
                                    {new Date(item.expiryDate!).toLocaleDateString('en-GB')}
                                    {isExpired ? (
                                      <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(EXP)</span>
                                    ) : (
                                      <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(SOON)</span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap">
                                  <span className={`text-[10px] font-bold whitespace-nowrap border px-2 py-0.5 rounded-lg ${isExpired
                                    ? 'text-rose-600 border-rose-100 bg-rose-50/30'
                                    : 'text-amber-600 border-amber-100 bg-amber-50/30'
                                    }`}>
                                    {isExpired ? `${daysDiff}d ago` : `in ${Math.abs(daysDiff)}d`}
                                  </span>
                                </td>
                                {!readOnly && (
                                  <td className="px-3 py-4 text-right whitespace-nowrap">
                                    <button
                                      onClick={() => setDeleteTarget({ roomId: item.roomId, itemId: item.id, name: item.name, batchIndex: item.batchIndex, qty: item.qty, expiryDate: item.expiryDate })}
                                      className="transition-all text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50"
                                      aria-label={`Delete ${item.name}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="md:hidden space-y-4">
                    {expiringItems.map(item => {
                      const isExpired = new Date(item.expiryDate!) < new Date();
                      const daysDiff = getDaysDiff(item.expiryDate!);
                      const totalPrice = item.qty * item.price;

                      return (
                        <div key={item.key} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 pr-2">
                              <div className="font-bold text-slate-800 text-sm leading-tight mb-1">{item.name}</div>
                              {item.description && (
                                <div className="text-[10px] text-slate-400 italic mb-1.5 truncate max-w-[200px]">
                                  {item.description}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="font-medium">#{item.brand || 'No Brand'}</span>
                                {item.code && (
                                  <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                                    <span className="font-mono text-slate-500">{item.code}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className="text-[#8e44ad] font-black tracking-tight text-sm">${totalPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              <span className="text-[9px] text-slate-400 font-medium">${item.price.toFixed(2)} / {item.uom || 'unit'}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Quantity</span>
                              <span className="font-bold text-[#8e44ad]">{item.qty} {item.uom || 'pcs'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Purchased</span>
                              <span className="font-medium text-slate-600">
                                {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString('en-GB') : '-'}
                              </span>
                            </div>

                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Vendor</span>
                              <span className="font-medium text-slate-600 truncate block">{item.vendor || '-'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Expires</span>
                              <span className={`font-bold ${isExpired ? 'text-rose-600' : 'text-amber-600'}`}>
                                {new Date(item.expiryDate!).toLocaleDateString('en-GB')}
                                {isExpired && <span className="ml-1 text-[8px] uppercase tracking-tight font-black bg-rose-100 text-rose-600 px-1 py-px rounded">(EXP)</span>}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold block mb-0.5">Location</span>
                              <span className="font-medium text-emerald-600">{item.roomName}</span>
                            </div>
                          </div>

                          {!readOnly && (
                            <button
                              onClick={() => setDeleteTarget({ roomId: item.roomId, itemId: item.id, name: item.name, batchIndex: item.batchIndex, qty: item.qty, expiryDate: item.expiryDate })}
                              className="w-full flex items-center justify-center gap-2 py-2 mt-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors text-xs font-bold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Batch
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-32 opacity-20"><ClipboardCheck className="w-24 h-24 mb-6" /><p className="text-2xl font-black uppercase tracking-[0.3em] text-slate-400">All Items Fresh</p></div>
              )}
            </div>
          )
        }
      </div>

      {/* Global Activity Feed (Footer) */}
      <div className="bg-white rounded-none md:rounded-[2.5rem] shadow-sm border-x-0 md:border border-slate-100 p-4 md:p-10 mt-6 mb-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="bg-slate-800 p-3 rounded-2xl">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-lg font-extrabold text-slate-800 tracking-wider uppercase">Recent Global Activity</h4>
            </div>
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

                  {log.beforeValue !== undefined && log.afterValue !== undefined &&
                   !log.details?.startsWith('Deleted room') &&
                   !log.beforeValue?.startsWith('[') &&
                   !log.beforeValue?.startsWith('{') && (
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-slate-100 px-3 py-1.5 rounded-xl shadow-sm">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Delta</span>
                        <span className="text-[12px] font-bold text-slate-400 line-through decoration-slate-300">{log.beforeValue}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                        <span className={`text-[12px] font-black ${Number(log.afterValue) > Number(log.beforeValue) ? 'text-emerald-600' : 'text-rose-600'}`}>
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
                {log.action === 'delete' && (() => {
                  // Item deletion: Deleted "ItemName"
                  const itemMatch = log.details?.match(/^Deleted "([^"]+)"$/);
                  // Room deletion: matches the legacy exact format
                  // ('Deleted room "RoomName"') plus both suffixes added when
                  // the transfer-on-delete option was introduced ("...and
                  // archived its items" / "...and transferred items to
                  // \"X\""). The ROOM itself is destroyed in every case, so
                  // "Restore Room" should offer to recreate it regardless of
                  // which delete mode was used — the transfer case just
                  // won't carry an item snapshot (App.tsx only sets
                  // beforeValue/afterValue for the non-transfer path), so
                  // restoreRoom() recreates an empty room rather than
                  // double-adding items that already live in the target
                  // room.
                  const roomMatch = log.details?.match(/^Deleted room "([^"]+)"(?: and (?:archived its items|transferred items to "[^"]+"))?$/);

                  if (itemMatch && onReceive) {
                    const itemName = itemMatch[1];
                    const parsedQty = Number(log.beforeValue);
                    const qty = isNaN(parsedQty) ? 1 : parsedQty;
                    return (
                      <button
                        onClick={() => {
                          onReceive(
                            log.roomId,
                            { name: itemName, category: 'other' as any, uom: 'pcs' as any },
                            qty,
                            0,
                            new Date().toISOString().split('T')[0]
                          );
                        }}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-all duration-200 whitespace-nowrap"
                        title={`Restore ${qty}x "${itemName}" to ${log.roomName}`}
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Restore Item
                      </button>
                    );
                  }

                  if (roomMatch && onRestoreRoom) {
                    const roomName = roomMatch[1];
                    const itemCount = Number(log.afterValue) || 0;
                    // Don't show restore button if a room with this name already exists
                    const alreadyExists = rooms.some(r => r.name === roomName && r.id !== TBA_ROOM_ID);
                    if (alreadyExists) return null;
                    return (
                      <button
                        onClick={() => onRestoreRoom(roomName, log.beforeValue)}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 hover:border-violet-300 transition-all duration-200 whitespace-nowrap"
                        title={`Recreate "${roomName}" with ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Restore Room {itemCount > 0 ? `+ ${itemCount} items` : ''}
                      </button>
                    );
                  }

                  return null;
                })()}
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
    </div >
  );
};

export default MasterInventory;