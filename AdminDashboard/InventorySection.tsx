
import React from 'react';
import { Search, Calendar, AlertTriangle, Building2, Map as MapIcon, ClipboardList, History as HistoryIcon, Filter, Layers, Truck, MapPin } from 'lucide-react';
import { GlobalInventoryItem, MockGlobalOrder } from './types';

interface InventorySectionProps {
  tab: 'all' | 'history' | 'expiring';
  onTabChange: (tab: 'all' | 'history' | 'expiring') => void;
  inventory: GlobalInventoryItem[];
  history: MockGlobalOrder[];
  expiring: GlobalInventoryItem[];
  itemsByCategory: Record<string, GlobalInventoryItem[]>;
}

const InventorySection: React.FC<InventorySectionProps> = ({
  tab,
  onTabChange,
  inventory,
  history,
  expiring,
  itemsByCategory
}) => {
  const [openBatchRows, setOpenBatchRows] = React.useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [selectedVendor, setSelectedVendor] = React.useState('all');
  const [selectedLocation, setSelectedLocation] = React.useState('all');

  const categories = React.useMemo(() => ['all', ...Array.from(new Set(inventory.map(item => item.category || 'Unknown'))).sort()], [inventory]);
  const vendors = React.useMemo(() => ['all', ...Array.from(new Set(inventory.map(item => item.vendor || 'Unknown'))).sort()], [inventory]);
  const locations = React.useMemo(() => ['all', ...Array.from(new Set(inventory.map(item => item.location || 'Unknown'))).sort()], [inventory]);

  const getDaysDiff = (dateStr: string) => {
    const now = new Date();
    const expiry = new Date(dateStr);
    const diffTime = now.getTime() - expiry.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const formatFullDateWithTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-GB');
  };

  const filteredInventory = React.useMemo(() => {
    let filtered = inventory;

    // Apply categorical filters
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }
    if (selectedVendor !== 'all') {
      filtered = filtered.filter(item => item.vendor === selectedVendor);
    }
    if (selectedLocation !== 'all') {
      filtered = filtered.filter(item => item.location === selectedLocation);
    }

    // Apply search query
    if (!searchQuery.trim()) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.vendor.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        item.clinic.toLowerCase().includes(q)
      );
    });
  }, [inventory, searchQuery, selectedCategory, selectedVendor, selectedLocation]);

  const filteredItemsByCategory = React.useMemo(() => {
    const groups: Record<string, GlobalInventoryItem[]> = {};
    Object.entries(itemsByCategory).forEach(([cat]) => {
      groups[cat] = [];
    });
    filteredInventory.forEach((item) => {
      const cat = (item.category || '').toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredInventory, itemsByCategory]);

  const filteredHistory = React.useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase();
    return history.filter((h) => {
      return (
        h.productName?.toLowerCase().includes(q) ||
        h.brand?.toLowerCase().includes(q) ||
        h.code?.toLowerCase().includes(q) ||
        h.vendor?.toLowerCase().includes(q) ||
        h.category?.toLowerCase().includes(q) ||
        h.clinic?.toLowerCase().includes(q)
      );
    });
  }, [history, searchQuery]);

  const groupedHistory = React.useMemo(() => {
    const sorted = [...filteredHistory].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return sorted.reduce((groups: { month: string; items: MockGlobalOrder[] }[], entry) => {
      const monthLabel = new Date(entry.timestamp).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
      const monthKey = monthLabel.toUpperCase();

      const existing = groups[groups.length - 1];
      if (existing && existing.month === monthKey) {
        existing.items.push(entry);
      } else {
        groups.push({ month: monthKey, items: [entry] });
      }
      return groups;
    }, []);
  }, [filteredHistory]);

  const filteredExpiring = React.useMemo(() => {
    if (!searchQuery.trim()) return expiring;
    const q = searchQuery.toLowerCase();
    return expiring.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      item.vendor.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q) ||
      item.clinic.toLowerCase().includes(q)
    );
  }, [expiring, searchQuery]);

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-8 duration-1000">
      <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-slate-100 p-2">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar-hide">
          <button
            onClick={() => onTabChange('all')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${tab === 'all' ? 'bg-[#4d9678] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <ClipboardList className="w-4 h-4" /> All Inventory ({inventory.length})
          </button>
          <button
            onClick={() => onTabChange('history')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${tab === 'history' ? 'bg-[#9b59b6] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <HistoryIcon className="w-4 h-4" /> Purchase History
          </button>
          <button
            onClick={() => onTabChange('expiring')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${tab === 'expiring' ? 'bg-[#f39c12] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <AlertTriangle className="w-4 h-4" /> Expiration Watchlist
          </button>
        </div>
        <div className="hidden md:flex px-4 border-l border-slate-100">
          {tab !== 'all' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search global data..."
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
        {tab === 'all' && (
          <div className="px-6 py-6 bg-slate-50/40 border-b border-slate-100 flex flex-col md:flex-row items-center gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Category Filter */}
              <div className="relative group">
                <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all appearance-none cursor-pointer min-w-[200px] shadow-sm hover:shadow-md"
                >
                  <option value="all">All Categories</option>
                  {categories.filter(c => c !== 'all').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-slate-400 rotate-45" />
                </div>
              </div>

              {/* Vendor Filter */}
              <div className="relative group">
                <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-amber-500 transition-colors" />
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500/50 transition-all appearance-none cursor-pointer min-w-[200px] shadow-sm hover:shadow-md"
                >
                  <option value="all">All Vendors</option>
                  {vendors.filter(v => v !== 'all').map(vendor => (
                    <option key={vendor} value={vendor}>{vendor}</option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-slate-400 rotate-45" />
                </div>
              </div>

              {/* Location Filter */}
              <div className="relative group">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all appearance-none cursor-pointer min-w-[200px] shadow-sm hover:shadow-md"
                >
                  <option value="all">All Locations</option>
                  {locations.filter(l => l !== 'all').map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-slate-400 rotate-45" />
                </div>
              </div>
            </div>

            <div className="relative group w-full md:flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-blue-600 transition-colors" />
              <input
                type="text"
                placeholder="Search records..."
                className="pl-12 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all w-full shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        )}

        {tab !== 'all' && (
          <div className="px-6 py-4 border-b border-slate-100 md:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search global data..."
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="overflow-x-auto custom-scrollbar p-1">
          {tab === 'all' && (
            <table className="w-full min-w-[1100px] border-collapse text-left text-xs animate-in fade-in duration-300">
              <thead className="bg-[#f8fafc] text-slate-500 font-black uppercase tracking-widest text-[9px] border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-5 w-[100px]">Brand</th>
                  <th className="px-6 py-5 w-[180px]">Product</th>
                  <th className="px-6 py-5 w-[90px]">Code</th>
                  <th className="px-6 py-5 w-[60px] text-center">Qty</th>
                  <th className="px-6 py-5 w-[60px]">UOM</th>
                  <th className="px-6 py-5 w-[80px]">Price</th>
                  <th className="px-6 py-5 w-[90px]">Total</th>
                  <th className="px-6 py-5 w-[100px]">Vendor</th>
                  <th className="px-6 py-5 w-[100px]">Category</th>
                  <th className="px-6 py-5 w-[100px]">Expires</th>
                  <th className="px-6 py-5 w-[110px]">Room Location</th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-slate-50">
                {Object.entries(filteredItemsByCategory).map(([cat, items]) =>
                  (items as GlobalInventoryItem[]).length > 0 && (
                    <React.Fragment key={cat}>
                      {/* Category separator */}
                      <tr className="bg-slate-100/70 border-y border-slate-200">
                        <td
                          colSpan={11}
                          className="px-6 py-3 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]"
                        >
                          {cat}
                        </td>
                      </tr>

                      {(items as GlobalInventoryItem[]).map((item, idx) => {
                        const now = new Date();
                        const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                        const expiryDateObj = item.expiryDate ? new Date(item.expiryDate) : null;
                        const isExpired = expiryDateObj ? expiryDateObj < now : false;
                        const isExpiringSoon = expiryDateObj ? !isExpired && expiryDateObj <= soonThreshold : false;
                        const batches = item.batches && item.batches.length ? item.batches : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
                        const batchKey = `${cat}-${idx}`;
                        const isOpen = !!openBatchRows[batchKey];

                        return (
                          <React.Fragment key={`${cat}-${idx}`}>
                            <tr
                              className={`${isOpen ? 'bg-blue-200/60' : 'hover:bg-slate-50/60'} transition-colors`}
                            >
                              <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                                {item.brand || '-'}
                              </td>

                              <td className="px-6 py-4 font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                {item.name}
                              </td>

                              <td className="px-6 py-4 text-[10px] text-slate-500 font-mono whitespace-nowrap">
                                {item.code || '-'}
                              </td>

                              <td className="px-6 py-4 font-bold text-slate-800 text-center">
                                {item.quantity}
                              </td>

                              <td className="px-6 py-4 text-slate-600 font-medium capitalize">
                                {item.uom}
                              </td>

                              <td className="px-6 py-4 text-slate-500 font-semibold">
                                ${item.price.toFixed(2)}
                              </td>

                              <td className="px-6 py-4 font-black text-[#4d9678]">
                                ${(item.quantity * item.price).toFixed(2)}
                              </td>

                              <td className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">
                                {item.vendor || '-'}
                              </td>

                              <td className="px-6 py-4">
                                <span className="text-[10px] font-medium text-slate-500 capitalize tracking-wide">
                                  {item.category}
                                </span>
                              </td>

                              <td
                                className={`px-6 py-4 text-xs whitespace-nowrap ${isExpired
                                  ? 'text-rose-600 font-bold'
                                  : isExpiringSoon
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-500'
                                  }`}
                              >
                                {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-GB') : '-'}
                                {isExpired && <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(EXP)</span>}
                                {isExpiringSoon && !isExpired && <span className="ml-1 text-[9px] uppercase tracking-tight font-black">(SOON)</span>}
                                {batches.length > 1 && (
                                  <button
                                    type="button"
                                    className="ml-2 text-[10px] font-bold text-blue-600 underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenBatchRows(prev => ({ ...prev, [batchKey]: !prev[batchKey] }));
                                    }}
                                  >
                                    {isOpen ? 'Hide' : 'View'}
                                  </button>
                                )}
                              </td>

                              <td className="px-6 py-4">
                                <span className="text-emerald-600 font-bold text-[10px] border border-emerald-100 px-2 py-0.5 rounded-lg bg-emerald-50/30 whitespace-nowrap">
                                  {item.location}
                                </span>
                              </td>
                            </tr>

                            {isOpen && batches.map((b, bIdx) => {
                              const bExpiry = b.expiryDate ? new Date(b.expiryDate) : null;
                              const bExpired = bExpiry ? bExpiry < now : false;
                              const bSoon = bExpiry ? !bExpired && bExpiry <= soonThreshold : false;
                              return (
                                <tr key={`${batchKey}-batch-${bIdx}`} className="bg-blue-100/50">
                                  <td className="px-6 py-2 text-[11px] text-slate-400">Batch {bIdx + 1}</td>
                                  <td className="px-6 py-2 text-[11px] font-semibold text-slate-700"></td>
                                  <td className="px-6 py-2 text-[11px] text-slate-400"></td>
                                  <td className="px-6 py-2 text-[11px] font-bold text-slate-800 text-center">{b.qty}</td>
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
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  )
                )}
              </tbody>
            </table>
          )}

          {tab === 'history' && (
            <table className="w-full text-[11px] text-left border-collapse min-w-[1000px]">
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
                {groupedHistory.length > 0 ? (
                  groupedHistory.map((group) => (
                    <React.Fragment key={group.month}>
                      <tr className="bg-purple-50/60 border-y border-purple-100">
                        <td
                          colSpan={12}
                          className="px-6 py-3 text-[10px] font-black text-[#9b59b6] uppercase tracking-[0.2em]"
                        >
                          {group.month}
                        </td>
                      </tr>
                      {group.items.map((h, idx) => {
                        const expiryDate = h.expiryDate ? new Date(h.expiryDate) : null;
                        const now = new Date();
                        const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                        const isExpired = expiryDate ? expiryDate < now : false;
                        const isExpiringSoon = expiryDate ? !isExpired && expiryDate <= soonThreshold : false;

                        return (
                          <tr key={`${group.month}-${idx}`} className="hover:bg-purple-50/20 transition-colors">
                            <td className="px-6 py-4 text-slate-500 whitespace-nowrap text-xs">
                              {formatFullDateWithTime(h.timestamp)}
                            </td>

                            <td className="px-6 py-4 text-slate-500 text-xs whitespace-nowrap">
                              #{h.brand || '-'}
                            </td>

                            <td className="px-6 py-4 font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                              {h.productName}
                            </td>

                            <td className="px-6 py-4 text-slate-500 text-[10px] whitespace-nowrap">
                              {h.code || '-'}
                            </td>

                            <td className="px-6 py-4 font-bold text-[#9b59b6] text-center whitespace-nowrap">
                              {h.qty}
                            </td>

                            <td className="px-6 py-4 text-slate-600 font-medium text-xs capitalize whitespace-nowrap">
                              {h.uom || 'pcs'}
                            </td>

                            <td className="px-6 py-4 text-slate-500 font-semibold whitespace-nowrap">
                              ${h.unitPrice?.toFixed(2) || '0.00'}
                            </td>

                            <td className="px-6 py-4 text-[#c0392b] font-black tracking-tight whitespace-nowrap">
                              ${h.amount.toFixed(2)}
                            </td>

                            <td className="px-6 py-4 text-slate-600 font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis">
                              {h.vendor || '-'}
                            </td>

                            <td className="px-6 py-4">
                              <span className="text-[10px] font-medium text-slate-500 capitalize tracking-wide">
                                {h.category}
                              </span>
                            </td>

                            <td
                              className={`px-6 py-4 text-xs whitespace-nowrap ${isExpired
                                ? 'text-rose-600 font-bold'
                                : isExpiringSoon
                                  ? 'text-amber-600 font-bold'
                                  : 'text-slate-500'
                                }`}
                            >
                              {expiryDate ? (
                                <>
                                  {expiryDate.toLocaleDateString('en-GB')}
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
                            </td>

                            <td className="px-6 py-4 text-emerald-600 font-bold text-[10px] whitespace-nowrap">
                              {h.clinic || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={12}
                      className="py-24 text-center text-slate-300 font-black uppercase tracking-[0.3em] opacity-50"
                    >
                      No Records Found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}



          {tab === 'expiring' && (
            <div className="p-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-300">
              {filteredExpiring.map((item, idx) => {
                const isExpired = new Date(item.expiryDate) < new Date();
                const daysDiff = getDaysDiff(item.expiryDate);
                return (
                  <div key={idx} className="bg-white rounded-[1.25rem] border border-slate-200 overflow-hidden shadow-sm flex flex-col group hover:shadow-md transition-shadow">
                    <div className={`px-5 py-2.5 flex items-center justify-between ${isExpired ? 'bg-rose-50 border-t-4 border-t-rose-500' : 'bg-amber-50 border-t-4 border-t-amber-500'}`}>
                      <div className={`flex items-center gap-2 font-bold text-[11px] uppercase tracking-wider ${isExpired ? 'text-rose-600' : 'text-amber-600'}`}>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {isExpired ? 'Expired' : 'Expiring Soon'}
                      </div>
                      <div className={`${isExpired ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'} px-3 py-1 rounded-full text-[10px] font-black tracking-tight`}>
                        {isExpired ? `${daysDiff}d ago` : `in ${Math.abs(daysDiff)}d`}
                      </div>
                    </div>
                    <div className="p-6 flex flex-col gap-6 flex-1">
                      <div className="flex flex-col gap-1">
                        <h5 className="font-bold text-slate-800 text-xl leading-tight truncate">{item.name}</h5>
                        <p className="text-sm font-medium text-slate-400">{item.brand} / <span className="font-mono text-[11px] opacity-75">{item.code}</span></p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Expiration</span>
                          <span className={`text-sm font-black ${isExpired ? 'text-rose-600' : 'text-slate-700'}`}>{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-GB') : '-'}</span>
                        </div>
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MapIcon className="w-3 h-3" /> Location</span>
                          <span className="text-sm font-black text-slate-700 truncate">{item.location}</span>
                        </div>
                      </div>
                      <div className="h-px bg-slate-100 w-full" />
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty on hand</span>
                          <span className="text-sm font-black text-slate-800">{item.quantity} {item.uom}</span>
                        </div>
                        <div className="flex flex-col gap-1 text-right">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Value</span>
                          <span className="text-sm font-black text-slate-800">${(item.quantity * item.price).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center gap-2">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{item.clinic}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div >
  );
};

export default InventorySection;
