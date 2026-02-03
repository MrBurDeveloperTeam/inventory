import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Building2,
  ChevronDown,
  Calendar,
  ArrowUpRight,
  Filter,
  TrendingUp,
  Store,
  Info,
  DollarSign,
  Hash,
  ShoppingCart
} from 'lucide-react';
import { UserProfile, Room, PurchaseHistory as AppPurchaseHistory } from '../types';
import { User, GlobalInventoryItem, MockGlobalOrder } from './types';
import { CATEGORIES, CATEGORY_ORDER } from '../constants';
import Sidebar from './Sidebar';
import Header from './Header';
import StatsCards from './StatsCards';
import SpendingChart from './SpendingChart';
import InventorySection from './InventorySection';
import UserManagement from './UserManagement';

type ManagedProfile = {
  user_id: string;
  email: string;
  name: string | null;
  account_type?: string | null;
  phone?: string | null;
  position?: string | null;
  company_name?: string | null;
  updated_at?: string | null;
  avatar_url?: string | null;
};

type ManagedInventory = {
  userId: string;
  rooms: Room[];
  history: AppPurchaseHistory[];
  blueprint?: string | null;
};

interface AdminDashboardProps {
  user: UserProfile;
  rooms: Room[];
  history: AppPurchaseHistory[];
  onLogout: () => void;
  onSwitchToClinic: () => void;
  managedProfiles?: ManagedProfile[];
  managedInventories?: ManagedInventory[];
  adminLoading?: boolean;
  adminError?: string | null;
  onRefreshAdminData?: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  rooms,
  history,
  onLogout,
  onSwitchToClinic,
  managedProfiles = [],
  managedInventories = [],
  adminLoading = false,
  adminError = null,
  onRefreshAdminData
}) => {
  const [sidebarItem, setSidebarItem] = useState('dashboard');
  const [adminInventoryTab, setAdminInventoryTab] = useState<'all' | 'history' | 'expiring'>('all');
  const [analysisMode, setAnalysisMode] = useState<'single' | 'compare'>('single');

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Derive the admin user list from Supabase profiles (fallbacks include current admin)
  const users = useMemo<User[]>(() => {
    const mapped: User[] = (managedProfiles || []).map((p) => ({
      id: p.user_id,
      name: p.name || p.email || 'User',
      contactName: p.account_type === 'company' ? p.name || undefined : undefined,
      email: p.email,
      phone: p.phone || '',
      type: p.account_type === 'company' ? 'Company' : 'Individual',
      jobPosition: p.position || 'Member',
      clinicName: p.company_name || 'Clinic',
      role: p.account_type === 'admin' ? 'Admin' : 'Dentist',
      lastActive: p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
      avatarUrl: p.avatar_url || null,
    }));

    const hasAdmin = mapped.some(u => u.role === 'Admin');
    if (!hasAdmin) {
      mapped.unshift({
        id: 'current_user',
        name: user.name,
        email: user.email,
        phone: user.phone,
        type: user.accountType === 'company' ? 'Company' : 'Individual',
        jobPosition: user.position,
        clinicName: user.companyName || 'My Dental Clinic',
        role: 'Admin',
        lastActive: new Date().toLocaleDateString('en-GB'),
        avatarUrl: (user as any).avatarUrl || null,
      });
    }
    return mapped;
  }, [managedProfiles, user]);

  // States for interactive charts
  const [categoryMetric, setCategoryMetric] = useState<'value' | 'quantity'>('value');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState('All');

  // Category chart tooltip state
  const [hoveredCategoryIdx, setHoveredCategoryIdx] = useState<number | null>(null);
  const [catMousePos, setCatMousePos] = useState({ x: 0, y: 0 });
  const catChartRef = useRef<SVGSVGElement>(null);

  // Vendor chart tooltip state
  const [hoveredVendorIdx, setHoveredVendorIdx] = useState<number | null>(null);
  const [vendorMousePos, setVendorMousePos] = useState({ x: 0, y: 0 });
  const vendorChartRef = useRef<SVGSVGElement>(null);

  const [spPeriodA, setSpPeriodA] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [spPeriodB, setSpPeriodB] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedSpCategory, setSelectedSpCategory] = useState('all');
  const [selectedSpVendor, setSelectedSpVendor] = useState('all');
  const [isSpCategoryOpen, setIsSpCategoryOpen] = useState(false);
  const [isSpVendorOpen, setIsSpVendorOpen] = useState(false);
  const [chartHoveredDay, setChartHoveredDay] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const spCategoryDropdownRef = useRef<HTMLDivElement>(null);
  const spVendorDropdownRef = useRef<HTMLDivElement>(null);
  const spChartRef = useRef<SVGSVGElement>(null);

  const profileMap = useMemo(() => {
    return new Map((managedProfiles || []).map((p) => [p.user_id, p]));
  }, [managedProfiles]);

  const inventorySource = useMemo(() => {
    if (managedInventories && managedInventories.length > 0) {
      return managedInventories;
    }
    return [{ userId: 'current_user', rooms, history }];
  }, [managedInventories, rooms, history]);

  // Map Real App Data to Admin Data formats
  const rawGlobalInventory = useMemo<GlobalInventoryItem[]>(() => {
    return inventorySource.flatMap((inv) =>
      (inv.rooms || []).flatMap(room => (
        room.items.map(item => ({
          id: item.id,
          brand: item.brand,
          name: item.name,
          code: item.code,
          quantity: item.quantity,
          uom: item.uom,
          price: item.price,
          vendor: item.vendor,
          category: item.category,
          expiryDate: item.expiryDate || '',
          location: room.name,
          clinic: profileMap.get(inv.userId)?.company_name || user.companyName || 'My Dental Clinic',
          userId: inv.userId,
          batches: item.batches
        }))
      ))
    );
  }, [inventorySource, profileMap, user]);

  const rawGlobalHistory = useMemo<MockGlobalOrder[]>(() => {
    return inventorySource.flatMap((inv) => (
      (inv.history || []).map(h => ({
        id: h.id.toString(),
        clinic: h.location || profileMap.get(inv.userId)?.company_name || user.companyName || 'My Dental Clinic',
        vendor: h.vendor,
        amount: h.totalPrice,
        status: 'delivered',
        date: new Date(h.timestamp).toLocaleDateString('en-GB'),
        timestamp: h.timestamp,
        category: h.category,
        productName: h.productName,
        brand: h.brand,
        code: h.code,
        qty: h.qty,
        unitPrice: h.unitPrice,
        uom: h.uom,
        expiryDate: h.expiryDate,
        userId: inv.userId
      }))
    ));
  }, [inventorySource, profileMap, user]);

  const selectedUser = useMemo(() => users.find(u => u.id === selectedUserId) || null, [users, selectedUserId]);

  const globalInventory = useMemo(() => {
    if (!selectedUserId) return rawGlobalInventory;
    return rawGlobalInventory.filter(item => item.userId === selectedUserId);
  }, [rawGlobalInventory, selectedUserId]);

  const globalHistory = useMemo(() => {
    if (!selectedUserId) return rawGlobalHistory;
    return rawGlobalHistory.filter(h => h.userId === selectedUserId);
  }, [rawGlobalHistory, selectedUserId, selectedUser]);

  const vendorSpendData = useMemo(() => {
    const data: Record<string, number> = {};
    globalHistory.forEach(h => {
      if (vendorCategoryFilter !== 'All' && h.category !== vendorCategoryFilter) return;
      const vendor = h.vendor || 'Unknown';
      data[vendor] = (data[vendor] || 0) + h.amount;
    });
    return Object.entries(data)
      .map(([name, spend]) => ({ name, spend }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 6);
  }, [globalHistory, vendorCategoryFilter]);

  const categoryBreakdownData = useMemo(() => {
    const order = ['materials', 'instruments', 'ppe', 'medication', 'equipment', 'consumables'];
    return order.map(id => {
      const cat = CATEGORIES.find(c => c.id === id) || { id, label: id };
      const items = globalInventory.filter(i => i.category === id);
      const value = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const quantity = items.reduce((sum, i) => sum + i.quantity, 0);
      return { ...cat, value, quantity };
    });
  }, [globalInventory]);

  const userInventoryStats = useMemo(() => {
    const stats: Record<string, { count: number; value: number }> = {};
    rawGlobalInventory.forEach(item => {
      if (item.userId) {
        if (!stats[item.userId]) stats[item.userId] = { count: 0, value: 0 };
        stats[item.userId].count += 1;
        stats[item.userId].value += item.quantity * item.price;
      }
    });
    return stats;
  }, [rawGlobalInventory]);

  const itemsByCategory = useMemo(() => {
    const groups: Record<string, any[]> = {};
    CATEGORY_ORDER.forEach(cat => {
      groups[cat.toUpperCase()] = globalInventory.filter(item => item.category === cat);
    });
    return groups;
  }, [globalInventory]);

  const expiringGlobalItems = useMemo(() => {
    const now = new Date();
    const threshold = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return globalInventory.filter(i => i.expiryDate && new Date(i.expiryDate) <= threshold);
  }, [globalInventory]);

  const spendingAnalysisData = useMemo(() => {
    const processMonth = (monthStr: string) => {
      const [year, month] = monthStr.split('-').map(Number);
      const days = new Date(year, month, 0).getDate();
      const data = Array(days).fill(0);
      let total = 0;
      globalHistory.forEach(h => {
        if (selectedSpCategory !== 'all' && h.category !== selectedSpCategory) return;
        if (selectedSpVendor !== 'all' && h.vendor !== selectedSpVendor) return;
        const d = new Date(h.timestamp);
        if (d.getFullYear() === year && (d.getMonth() + 1) === month) {
          const day = d.getDate();
          if (day <= days) {
            data[day - 1] += h.amount;
            total += h.amount;
          }
        }
      });
      return { data, total, days };
    };

    const periodAStats = processMonth(spPeriodA);
    const periodBStats = processMonth(spPeriodB);
    const maxVal = Math.max(...periodAStats.data, ...periodBStats.data, 500);
    const yAxisSteps = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
    const growth = periodBStats.total > 0 ? ((periodAStats.total - periodBStats.total) / periodBStats.total) * 100 : 0;
    const multiplier = periodBStats.total > 0 ? (periodAStats.total / periodBStats.total).toFixed(1) : '0';

    return { periodAStats, periodBStats, maxVal, yAxisSteps, growth, multiplier };
  }, [globalHistory, spPeriodA, spPeriodB, selectedSpCategory, selectedSpVendor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (spCategoryDropdownRef.current && !spCategoryDropdownRef.current.contains(event.target as Node)) setIsSpCategoryOpen(false);
      if (spVendorDropdownRef.current && !spVendorDropdownRef.current.contains(event.target as Node)) setIsSpVendorOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatPeriodName = (period: string) => {
    const [y, m] = period.split('-');
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const handleSelectUser = (id: string | null) => {
    setSelectedUserId(id);
    setSidebarItem('dashboard');
  };

  const handleHoverDay = (day: number | null, pos?: { x: number, y: number }) => {
    setChartHoveredDay(day);
    if (pos) {
      setMousePos(pos);
    }
  };

  const renderCategoryChart = () => {
    const computeNiceSteps = (maxValue: number, targetTicks = 5) => {
      if (!isFinite(maxValue) || maxValue <= 0) return [0, 1, 2, 3, 4];

      const niceNumber = (value: number, round: boolean) => {
        const exponent = Math.floor(Math.log10(value));
        const fraction = value / Math.pow(10, exponent);
        let niceFraction;
        if (round) {
          if (fraction < 1.5) niceFraction = 1;
          else if (fraction < 3) niceFraction = 2;
          else if (fraction < 7) niceFraction = 5;
          else niceFraction = 10;
        } else {
          if (fraction <= 1) niceFraction = 1;
          else if (fraction <= 2) niceFraction = 2;
          else if (fraction <= 5) niceFraction = 5;
          else niceFraction = 10;
        }
        return niceFraction * Math.pow(10, exponent);
      };

      const range = niceNumber(maxValue, false);
      const step = niceNumber(range / (targetTicks - 1), true);
      const niceMax = Math.ceil(maxValue / step) * step;

      const steps: number[] = [];
      for (let v = 0; v <= niceMax; v += step) {
        steps.push(v);
        if (steps.length > targetTicks + 2) break; // safety to avoid runaway loops
      }
      if (steps[steps.length - 1] !== niceMax) steps.push(niceMax);

      return steps;
    };

    const width = 800;
    const height = 400;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 40;
    const paddingBottom = 40;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const isValue = categoryMetric === 'value';
    const maxAxisValue = Math.max(...categoryBreakdownData.map(cat => isValue ? cat.value : cat.quantity), 0);
    const displayYSteps = computeNiceSteps(maxAxisValue || (isValue ? 100 : 10));
    const yTop = displayYSteps[displayYSteps.length - 1] || 1;

    const barWidth = 70;
    const gap = (chartWidth - (categoryBreakdownData.length * barWidth)) / (categoryBreakdownData.length + 1);

    const handleMouseMove = (e: React.MouseEvent, index: number) => {
      const svg = catChartRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCatMousePos({ x, y });
      setHoveredCategoryIdx(index);
    };

    return (
      <div className="relative group/cat">
        <svg
          ref={catChartRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="overflow-visible"
        >
          {displayYSteps.map((step) => {
            const y = height - paddingBottom - (step / yTop) * chartHeight;
            return (
              <g key={step}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f1f5f9" strokeWidth="1.5" strokeDasharray="6 4" />
                <text x={paddingLeft - 15} y={y + 5} textAnchor="end" className="text-[16px] fill-slate-400 font-medium">{step}</text>
              </g>
            );
          })}

          {categoryBreakdownData.map((cat, i) => {
            const val = isValue ? cat.value : cat.quantity;
            const barHeight = Math.min((val / yTop) * chartHeight, chartHeight);
            const xPos = paddingLeft + gap + (i * (barWidth + gap));
            const yPos = height - paddingBottom - barHeight;

            return (
              <g
                key={i}
                onMouseLeave={() => setHoveredCategoryIdx(null)}
                className="transition-all"
              >
                <rect
                  x={xPos - gap / 2}
                  y={paddingTop}
                  width={barWidth + gap}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={(e) => handleMouseMove(e, i)}
                  onMouseMove={(e) => handleMouseMove(e, i)}
                />

                {hoveredCategoryIdx === i && (
                  <rect
                    x={xPos - gap / 2}
                    y={paddingTop}
                    width={barWidth + gap}
                    height={chartHeight}
                    fill="#f8fafc"
                    className="animate-in fade-in duration-200 pointer-events-none"
                  />
                )}

                <rect
                  x={xPos}
                  y={yPos}
                  width={barWidth}
                  height={barHeight}
                  fill="#4285f4"
                  rx="4"
                  className={`transition-all duration-300 pointer-events-none ${hoveredCategoryIdx === i ? 'brightness-110' : 'opacity-90'}`}
                />

                <text
                  x={xPos + barWidth / 2}
                  y={height - paddingBottom + 25}
                  textAnchor="middle"
                  className={`text-[16px] font-medium tracking-tight transition-colors pointer-events-none ${hoveredCategoryIdx === i ? 'fill-slate-800' : 'fill-slate-400'}`}
                >
                  {cat.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredCategoryIdx !== null && (
          <div
            className="absolute pointer-events-none z-[100] animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: `${catMousePos.x}px`,
              top: `${catMousePos.y}px`,
              transform: 'translate(-50%, -100%) translateY(-20px)',
            }}
          >
            <div className="bg-white rounded-xl p-4 shadow-2xl border border-slate-100 min-w-[160px]">
              <p className="text-sm font-black text-slate-800 mb-1">{categoryBreakdownData[hoveredCategoryIdx].label}</p>
              <p className={`text-xs font-bold ${isValue ? 'text-blue-500' : 'text-[#6366f1]'}`}>
                {isValue ? 'Total Value : ' : 'Total Units : '}
                {isValue ? `$${categoryBreakdownData[hoveredCategoryIdx].value.toLocaleString()}` : categoryBreakdownData[hoveredCategoryIdx].quantity.toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderVendorSpendChart = () => {
    const width = 800;
    const height = 400;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 40;
    const paddingBottom = 40;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxValRaw = Math.max(...vendorSpendData.map(v => v.spend), 1);
    const maxVal = Math.ceil(maxValRaw / 1500) * 1500;
    const ySteps = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

    const barWidth = 70;
    const gap = (chartWidth - (vendorSpendData.length * barWidth)) / (vendorSpendData.length + 1);

    const handleMouseMove = (e: React.MouseEvent, index: number) => {
      const svg = vendorChartRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setVendorMousePos({ x, y });
      setHoveredVendorIdx(index);
    };

    return (
      <div className="relative group/vendor">
        <svg
          ref={vendorChartRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="overflow-visible"
        >
          {ySteps.map((step) => {
            const y = height - paddingBottom - (step / maxVal) * chartHeight;
            return (
              <g key={step}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f1f5f9" strokeWidth="1.5" strokeDasharray="6 4" />
                <text x={paddingLeft - 15} y={y + 5} textAnchor="end" className="text-[16px] fill-slate-400 font-medium">${Math.round(step).toLocaleString()}</text>
              </g>
            );
          })}

          {vendorSpendData.map((v, i) => {
            const barHeight = (v.spend / maxVal) * chartHeight;
            const xPos = paddingLeft + gap + (i * (barWidth + gap));
            const yPos = height - paddingBottom - barHeight;

            return (
              <g
                key={i}
                onMouseLeave={() => setHoveredVendorIdx(null)}
                className="transition-all"
              >
                <rect
                  x={xPos - gap / 2}
                  y={paddingTop}
                  width={barWidth + gap}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={(e) => handleMouseMove(e, i)}
                  onMouseMove={(e) => handleMouseMove(e, i)}
                />

                {hoveredVendorIdx === i && (
                  <rect
                    x={xPos - gap / 2}
                    y={paddingTop}
                    width={barWidth + gap}
                    height={chartHeight}
                    fill="#f8fafc"
                    className="animate-in fade-in duration-200 pointer-events-none"
                  />
                )}

                <rect
                  x={xPos}
                  y={yPos}
                  width={barWidth}
                  height={barHeight}
                  fill="#6366f1"
                  rx="4"
                  className={`transition-all duration-300 pointer-events-none ${hoveredVendorIdx === i ? 'brightness-110' : 'opacity-90'}`}
                />

                <text
                  x={xPos + barWidth / 2}
                  y={height - paddingBottom + 25}
                  textAnchor="middle"
                  className={`text-[16px] font-medium tracking-tight transition-colors pointer-events-none ${hoveredVendorIdx === i ? 'fill-slate-800' : 'fill-slate-400'}`}
                >
                  {v.name.length > 12 ? v.name.slice(0, 10) + '...' : v.name}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredVendorIdx !== null && (
          <div
            className="absolute pointer-events-none z-[100] animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: `${vendorMousePos.x}px`,
              top: `${vendorMousePos.y}px`,
              transform: 'translate(-50%, -100%) translateY(-20px)',
            }}
          >
            <div className="bg-white rounded-xl p-4 shadow-2xl border border-slate-100 min-w-[160px]">
              <p className="text-sm font-black text-slate-800 mb-1">{vendorSpendData[hoveredVendorIdx].name}</p>
              <p className="text-xs font-bold text-indigo-600">
                Total Spend: ${vendorSpendData[hoveredVendorIdx].spend.toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const currentSpCategoryOption = useMemo(() => [
    { id: 'all', label: 'All Categories', icon: <Filter className="w-4 h-4" /> },
    ...CATEGORIES
  ].find(opt => opt.id === selectedSpCategory), [selectedSpCategory]);

  const spVendorOptions = [
    { id: 'all', label: 'All Vendors', icon: <Store className="w-4 h-4" /> },
    { id: 'Henry Schein', label: 'Henry Schein', icon: <Building2 className="w-4 h-4" /> },
    { id: 'Patterson Dental', label: 'Patterson Dental', icon: <Building2 className="w-4 h-4" /> },
    { id: 'Benco Dental', label: 'Benco Dental', icon: <Building2 className="w-4 h-4" /> },
    { id: 'Darby Dental', label: 'Darby Dental', icon: <Building2 className="w-4 h-4" /> },
  ];
  const currentSpVendorOption = spVendorOptions.find(opt => opt.id === selectedSpVendor);

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden w-full">
      <Sidebar
        activeItem={sidebarItem}
        onItemSelect={setSidebarItem}
        onLogout={onLogout}
      />

      <main className="flex-1 overflow-y-auto flex flex-col relative w-full">
        <Header
          title={sidebarItem === 'dashboard' ? 'Admin Overview' : (sidebarItem === 'users' ? 'User Directory' : sidebarItem)}
          users={users}
          selectedUserId={selectedUserId}
          onUserSelect={handleSelectUser}
        />

        <div className="p-8 space-y-8 w-full">
          {sidebarItem === 'dashboard' && (
            <>
              <StatsCards inventory={globalInventory} history={globalHistory} expiring={expiringGlobalItems} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* CATEGORY BREAKDOWN */}
                <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 p-8 group transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Breakdown by Category</h3>
                      <div className="text-xs text-slate-400 flex items-center gap-1 font-bold">
                        <Info size={14} className="opacity-60" />
                        {categoryMetric === 'value' ? 'Total value aggregated per category' : 'Total quantity aggregated per category'}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex bg-slate-100 p-1.5 rounded-xl">
                        <button
                          onClick={() => setCategoryMetric('value')}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${categoryMetric === 'value' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          <DollarSign size={14} /> Value
                        </button>
                        <button
                          onClick={() => setCategoryMetric('quantity')}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${categoryMetric === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          <Hash size={14} /> Qty
                        </button>
                      </div>
                    </div>
                  </div>
                  {renderCategoryChart()}
                </div>

                {/* VENDOR SPEND */}
                <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-100 p-8 group transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">Spend by Vendor</h3>
                      <div className="text-xs text-slate-400 flex items-center gap-1 font-bold">
                        <Building2 size={14} className="opacity-60" /> Total historical spend
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          value={vendorCategoryFilter}
                          onChange={(e) => setVendorCategoryFilter(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-10 py-1.5 text-[11px] font-bold text-slate-600 outline-none cursor-pointer appearance-none transition-all hover:bg-slate-100"
                        >
                          <option value="All">All Categories</option>
                          {CATEGORIES.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                          ))}
                        </select>
                        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                      </div>
                    </div>
                  </div>
                  {vendorSpendData.length > 0 ? (
                    renderVendorSpendChart()
                  ) : (
                    <div className="h-[340px] flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl">
                      <ShoppingCart size={32} className="opacity-20" />
                      <p className="text-xs font-medium">No purchase data for this category</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">{selectedUser ? `${selectedUser.name}'s Spending` : 'Global Spending Analysis'}</h3>
                    <p className="text-xs text-slate-400 font-medium">{selectedUser ? `Analyzing financial data for ${selectedUser.clinicName}` : 'Aggregated trend data across all locations'}</p>
                  </div>
                  <div className="bg-slate-50 p-1 rounded-xl border border-slate-100 flex gap-1">
                    <button onClick={() => setAnalysisMode('single')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${analysisMode === 'single' ? 'bg-white text-[#06b6d4] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Single Period</button>
                    <button onClick={() => setAnalysisMode('compare')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${analysisMode === 'compare' ? 'bg-white text-[#8b5cf6] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Compare Months</button>
                  </div>
                </div>

                <div className="flex flex-col gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Primary Period</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="month" value={spPeriodA} onChange={(e) => setSpPeriodA(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#06b6d4]/20 transition-all" />
                      </div>
                    </div>
                    {analysisMode === 'compare' ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Comparison Period</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input type="month" value={spPeriodB} onChange={(e) => setSpPeriodB(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#8b5cf6]/20 transition-all" />
                        </div>
                      </div>
                    ) : <div className="h-[46px]" />}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                    <div className="relative" ref={spCategoryDropdownRef}>
                      <button onClick={() => setIsSpCategoryOpen(!isSpCategoryOpen)} className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#06b6d4] transition-all">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="p-1.5 bg-cyan-50 text-[#06b6d4] rounded-lg shrink-0">{currentSpCategoryOption?.icon}</div>
                          <span className="text-[11px] font-bold text-slate-700 truncate">{currentSpCategoryOption?.label}</span>
                        </div>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>
                      {isSpCategoryOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden">
                          {[{ id: 'all', label: 'All Categories', icon: <Filter className="w-4 h-4" /> }, ...CATEGORIES].map(opt => (
                            <button key={opt.id} onClick={() => { setSelectedSpCategory(opt.id); setIsSpCategoryOpen(false); }} className={`w-full flex items-center gap-2 p-2.5 text-[10px] font-bold ${selectedSpCategory === opt.id ? 'bg-cyan-50 text-[#06b6d4]' : 'hover:bg-slate-50 text-slate-600'}`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative" ref={spVendorDropdownRef}>
                      <button onClick={() => setIsSpVendorOpen(!isSpVendorOpen)} className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#06b6d4] transition-all">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="p-1.5 bg-cyan-50 text-[#06b6d4] rounded-lg shrink-0">{currentSpVendorOption?.icon}</div>
                          <span className="text-[11px] font-bold text-slate-700 truncate">{currentSpVendorOption?.label}</span>
                        </div>
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      </button>
                      {isSpVendorOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden">
                          {spVendorOptions.map(opt => (
                            <button key={opt.id} onClick={() => { setSelectedSpVendor(opt.id); setIsSpVendorOpen(false); }} className={`w-full flex items-center gap-2 p-2.5 text-[10px] font-bold ${selectedSpVendor === opt.id ? 'bg-cyan-50 text-[#06b6d4]' : 'hover:bg-slate-50 text-slate-600'}`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {analysisMode === 'compare' && (
                  <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-12">
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{formatPeriodName(spPeriodA)}</p>
                        <p className="text-2xl font-black text-slate-800">${Math.round(spendingAnalysisData.periodAStats.total).toLocaleString()}</p>
                      </div>
                      <TrendingUp className="w-5 h-5 text-slate-300" />
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">{formatPeriodName(spPeriodB)}</p>
                        <p className="text-2xl font-black text-slate-400">${Math.round(spendingAnalysisData.periodBStats.total).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-100 text-xs font-black mb-1">
                        <ArrowUpRight className="w-3 h-3" /> {spendingAnalysisData.growth.toFixed(1)}%
                      </div>
                      <p className="text-[10px] font-medium text-slate-400">Spending ratio: {spendingAnalysisData.multiplier}x</p>
                    </div>
                  </div>
                )}

                <SpendingChart
                  data={spendingAnalysisData}
                  analysisMode={analysisMode}
                  hoveredDay={chartHoveredDay}
                  onHoverDay={handleHoverDay}
                  mousePos={mousePos}
                  periodAName={formatPeriodName(spPeriodA)}
                  periodBName={formatPeriodName(spPeriodB)}
                  chartRef={spChartRef}
                />
              </div>

              <InventorySection
                tab={adminInventoryTab}
                onTabChange={setAdminInventoryTab}
                inventory={globalInventory}
                history={globalHistory}
                expiring={expiringGlobalItems}
                itemsByCategory={itemsByCategory}
              />
            </>
          )}

          {sidebarItem === 'users' && (
            <UserManagement
              users={users}
              userInventoryStats={userInventoryStats}
              onSelectUser={handleSelectUser}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
