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
  ShoppingCart,
  Package,
  Check,
  PieChart,
  PackageSearch,
  RefreshCw,
  Layout,
  Clock
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        clinicName: user.clinicName || 'My Dental Clinic',
        role: 'Admin',
        lastActive: new Date().toLocaleDateString('en-GB'),
        avatarUrl: (user as any).avatarUrl || null,
      });
    }
    return mapped;
  }, [managedProfiles, user]);

  // States for interactive charts
  const [categoryMetric, setCategoryMetric] = useState<'value' | 'quantity'>('value'); // Keep for safety if used elsewhere or remove later

  // Category Breakdown State
  const [categoryViewMode, setCategoryViewMode] = useState<'combine' | 'value' | 'quantity'>('combine');
  const [inventoryBreakdownPeriod, setInventoryBreakdownPeriod] = useState('all');
  const [inventoryDimension, setInventoryDimension] = useState<'category' | 'vendor'>('category');

  const [isCatViewDropdownOpen, setIsCatViewDropdownOpen] = useState(false);
  const [isInvPeriodDropdownOpen, setIsInvPeriodDropdownOpen] = useState(false);
  const [isInvDimensionDropdownOpen, setIsInvDimensionDropdownOpen] = useState(false);

  const catViewDropdownRef = useRef<HTMLDivElement>(null);
  const invPeriodDropdownRef = useRef<HTMLDivElement>(null);
  const invDimensionDropdownRef = useRef<HTMLDivElement>(null);

  // Category chart tooltip state
  const [hoveredCategoryIdx, setHoveredCategoryIdx] = useState<number | null>(null);
  const [catMousePos, setCatMousePos] = useState({ x: 0, y: 0 });
  const catChartRef = useRef<SVGSVGElement>(null);
  // Clinic Distribution Chart State
  const [hoveredDistIdx, setHoveredDistIdx] = useState<number | null>(null);
  const [distMousePos, setDistMousePos] = useState({ x: 0, y: 0, containerWidth: 0 });
  const [isMouseOverDist, setIsMouseOverDist] = useState(false);
  const [distributionPeriod, setDistributionPeriod] = useState('all');
  const [breakdownType, setBreakdownType] = useState<'category' | 'vendor' | 'consumed' | 'reordered'>('category');
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [isBreakdownDropdownOpen, setIsBreakdownDropdownOpen] = useState(false);

  const distContainerRef = useRef<HTMLDivElement>(null);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const breakdownDropdownRef = useRef<HTMLDivElement>(null);

  const getCategoryColor = (catId: string) => {
    const colors: Record<string, string> = {
      'equipment': '#2563eb',
      'consumables': '#facc15',
      'medication': '#f97316',
      'instruments': '#db2777',
      'ppe': '#9333ea',
      'materials': '#dc2626',
      'other': '#10b981'
    };
    return colors[catId.toLowerCase()] || '#94a3b8';
  };

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
          clinic: profileMap.get(inv.userId)?.company_name || user.clinicName || 'My Dental Clinic',
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
        clinic: h.location || profileMap.get(inv.userId)?.company_name || user.clinicName || 'My Dental Clinic',
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

  const availableMonths = useMemo(() => {
    const dates = globalHistory.map(h => new Date(h.timestamp));
    if (dates.length === 0) return [];

    const unique = new Set<string>();
    dates.forEach(d => {
      unique.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    });

    return Array.from(unique).sort((a, b) => {
      const [y1, m1] = a.split('-').map(Number);
      const [y2, m2] = b.split('-').map(Number);
      return (y2 - y1) || (m2 - m1); // descending
    });
  }, [globalHistory]);

  // Clinic Distribution Data Logic
  const breakdownOptions = [
    { value: 'category', label: 'By Category', icon: <PieChart className="w-4 h-4" /> },
    { value: 'vendor', label: 'By Vendor', icon: <Building2 className="w-4 h-4" /> },
    { value: 'consumed', label: 'Most Consumed', icon: <PackageSearch className="w-4 h-4" /> },
    { value: 'reordered', label: 'Most Reordered', icon: <RefreshCw className="w-4 h-4" /> }
  ];
  const currentBreakdownOption = breakdownOptions.find(o => o.value === breakdownType)!;



  const distributionHistory = useMemo(() => {
    if (distributionPeriod === 'all') return globalHistory;
    const [y, m] = distributionPeriod.split('-').map(Number);
    return globalHistory.filter(h => {
      const d = new Date(h.timestamp);
      return d.getFullYear() === y && (d.getMonth() + 1) === m;
    });
  }, [globalHistory, distributionPeriod]);

  const currentBreakdown = useMemo(() => {
    const totalExpense = distributionHistory.reduce((sum, h) => sum + h.amount, 0);
    const totalQuantity = distributionHistory.reduce((sum, h) => sum + h.qty, 0);
    const totalReorders = distributionHistory.length;

    let data: { id: string, label: string, amount: number, percentage: number, totalSpent?: number, count?: number, icon?: React.ReactNode }[] = [];
    let totalValue = 0;

    if (breakdownType === 'category') {
      data = CATEGORIES.map(cat => {
        const items = distributionHistory.filter(h => h.category === cat.id);
        const val = items.reduce((sum, h) => sum + h.amount, 0);
        return {
          id: cat.id,
          label: cat.label,
          amount: val, // Value
          percentage: totalExpense > 0 ? (val / totalExpense) * 100 : 0,
          totalSpent: val,
          icon: <PieChart className="w-4 h-4" />
        };
      }).filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount);
      totalValue = totalExpense;
    } else if (breakdownType === 'vendor') {
      const map: Record<string, number> = {};
      distributionHistory.forEach(h => {
        const v = h.vendor || 'Unknown';
        map[v] = (map[v] || 0) + h.amount;
      });
      const sorted = Object.entries(map).map(([k, v]) => ({
        id: k, label: k, amount: v, percentage: totalExpense > 0 ? (v / totalExpense) * 100 : 0, totalSpent: v, icon: <Building2 className="w-4 h-4" />
      })).sort((a, b) => b.amount - a.amount);

      const top = sorted.slice(0, 5);
      const others = sorted.slice(5).reduce((sum, item) => sum + item.amount, 0);
      data = top;
      if (others > 0) {
        data.push({ id: 'others', label: 'Others', amount: others, percentage: totalExpense > 0 ? (others / totalExpense) * 100 : 0, totalSpent: others, icon: <Layout className="w-4 h-4" /> });
      }
      totalValue = totalExpense;
    } else if (breakdownType === 'consumed') {
      const map: Record<string, { qty: number, spent: number }> = {};
      distributionHistory.forEach(h => {
        const k = (h.productName || 'Unknown').trim();
        if (!map[k]) map[k] = { qty: 0, spent: 0 };
        map[k].qty += h.qty;
        map[k].spent += h.amount;
      });
      const sorted = Object.entries(map).map(([k, v]) => ({
        id: k, label: k, amount: v.qty, percentage: totalQuantity > 0 ? (v.qty / totalQuantity) * 100 : 0, totalSpent: v.spent, icon: <PackageSearch className="w-4 h-4" />
      })).sort((a, b) => b.amount - a.amount);

      const top = sorted.slice(0, 5);
      const others = sorted.slice(5).reduce((sum, item) => sum + item.amount, 0);
      data = top;
      if (others > 0) {
        data.push({ id: 'others', label: 'Other Products', amount: others, percentage: totalQuantity > 0 ? (others / totalQuantity) * 100 : 0, totalSpent: 0, icon: <Layout className="w-4 h-4" /> });
      }
      totalValue = totalQuantity;
    } else if (breakdownType === 'reordered') {
      const map: Record<string, { count: number, spent: number }> = {};
      distributionHistory.forEach(h => {
        const k = (h.productName || 'Unknown').trim();
        if (!map[k]) map[k] = { count: 0, spent: 0 };
        map[k].count += 1;
        map[k].spent += h.amount;
      });
      const sorted = Object.entries(map).map(([k, v]) => ({
        id: k, label: k, amount: v.count, percentage: totalReorders > 0 ? (v.count / totalReorders) * 100 : 0, totalSpent: v.spent, icon: <RefreshCw className="w-4 h-4" />
      })).sort((a, b) => b.amount - a.amount);

      const top = sorted.slice(0, 5);
      const others = sorted.slice(5).reduce((sum, item) => sum + item.amount, 0);
      data = top;
      if (others > 0) {
        data.push({ id: 'others', label: 'Other Products', amount: others, percentage: totalReorders > 0 ? (others / totalReorders) * 100 : 0, totalSpent: 0, icon: <Layout className="w-4 h-4" /> });
      }
      totalValue = totalReorders;
    }

    return {
      data,
      totalValue,
      isReorderReport: breakdownType === 'reordered',
      isQuantityReport: breakdownType === 'consumed',
      symbol: (breakdownType === 'category' || breakdownType === 'vendor') ? '$' : ''
    };
  }, [distributionHistory, breakdownType]);





  const handleDonutMouseMove = (e: React.MouseEvent) => {
    const container = distContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setDistMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      containerWidth: rect.width
    });
  };

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
    const maxDataVal = Math.max(...periodAStats.data, ...periodBStats.data, 500);
    const targetStepCount = 4;
    const rawStep = maxDataVal / targetStepCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;

    let niceStep;
    if (normalized <= 1) niceStep = 1 * magnitude;
    else if (normalized <= 2) niceStep = 2 * magnitude;
    else if (normalized <= 5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    let niceMax = niceStep * targetStepCount;
    while (niceMax < maxDataVal) {
      niceMax += niceStep;
    }

    const yAxisSteps = [];
    for (let i = 0; i <= niceMax; i += niceStep) {
      yAxisSteps.push(i);
    }
    const maxVal = niceMax;
    const growth = periodBStats.total > 0 ? ((periodAStats.total - periodBStats.total) / periodBStats.total) * 100 : 0;
    const multiplier = periodBStats.total > 0 ? (periodAStats.total / periodBStats.total).toFixed(1) : '0';

    return { periodAStats, periodBStats, maxVal, yAxisSteps, growth, multiplier };
  }, [globalHistory, spPeriodA, spPeriodB, selectedSpCategory, selectedSpVendor]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (spCategoryDropdownRef.current && !spCategoryDropdownRef.current.contains(event.target as Node)) setIsSpCategoryOpen(false);
      if (spVendorDropdownRef.current && !spVendorDropdownRef.current.contains(event.target as Node)) setIsSpVendorOpen(false);
      if (catViewDropdownRef.current && !catViewDropdownRef.current.contains(event.target as Node)) setIsCatViewDropdownOpen(false);
      if (invPeriodDropdownRef.current && !invPeriodDropdownRef.current.contains(event.target as Node)) setIsInvPeriodDropdownOpen(false);
      if (invDimensionDropdownRef.current && !invDimensionDropdownRef.current.contains(event.target as Node)) setIsInvDimensionDropdownOpen(false);
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

  /* Logic for Inventory Breakdown Chart */
  const inventoryBreakdownHistory = useMemo(() => {
    if (inventoryBreakdownPeriod === 'all') return globalHistory;
    const [y, m] = inventoryBreakdownPeriod.split('-').map(Number);
    return globalHistory.filter(h => {
      const d = new Date(h.timestamp);
      return d.getFullYear() === y && (d.getMonth() + 1) === m;
    });
  }, [globalHistory, inventoryBreakdownPeriod]);

  const inventoryBreakdownData = useMemo(() => {
    let data: { label: string, value: number, quantity: number, color: string }[] = [];

    if (inventoryDimension === 'category') {
      data = CATEGORIES.map(cat => {
        const items = inventoryBreakdownHistory.filter(h => h.category === cat.id);
        const val = items.reduce((sum, h) => sum + h.amount, 0);
        const qty = items.reduce((sum, h) => sum + h.qty, 0);
        return {
          label: cat.label,
          value: val,
          quantity: qty,
          color: getCategoryColor(cat.id)
        };
      }).filter(d => d.value > 0 || d.quantity > 0).sort((a, b) => b.value - a.value);
    } else {
      // Vendor Breakdown
      const map: Record<string, { value: number, quantity: number }> = {};
      inventoryBreakdownHistory.forEach(h => {
        const v = h.vendor || 'Unknown';
        if (!map[v]) map[v] = { value: 0, quantity: 0 };
        map[v].value += h.amount;
        map[v].quantity += h.qty;
      });
      const defaultColors = ['#2563eb', '#facc15', '#f97316', '#db2777', '#9333ea', '#dc2626', '#10b981'];
      data = Object.entries(map).map(([k, v], idx) => ({
        label: k,
        value: v.value,
        quantity: v.quantity,
        color: defaultColors[idx % defaultColors.length]
      })).sort((a, b) => b.value - a.value).slice(0, 8); // Limit to top 8 vendors
    }
    return data;
  }, [inventoryBreakdownHistory, inventoryDimension]);

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
        if (steps.length > targetTicks + 2) break;
      }
      if (steps[steps.length - 1] !== niceMax) steps.push(niceMax);

      return steps;
    };

    const width = 800;
    const height = windowWidth < 640 ? 850 : 800;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 50;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const isCombine = categoryViewMode === 'combine';
    const isValueMode = categoryViewMode === 'value';
    const isQtyMode = categoryViewMode === 'quantity';

    // Scale calculation based on mode
    let valueZoneHeight: number, qtyZoneHeight: number, baselineY: number;
    if (isCombine) {
      const midPadding = 30;
      const splitRatio = 0.6;
      valueZoneHeight = (chartHeight - midPadding) * splitRatio;
      qtyZoneHeight = (chartHeight - midPadding) * (1 - splitRatio);
      baselineY = paddingTop + valueZoneHeight;
    } else {
      valueZoneHeight = chartHeight;
      qtyZoneHeight = chartHeight;
      baselineY = paddingTop + chartHeight; // Both regular modes grow up from bottom
    }

    const maxValue = Math.max(...inventoryBreakdownData.map(cat => cat.value), 0);
    const maxQty = Math.max(...inventoryBreakdownData.map(cat => cat.quantity), 0);

    const displayYStepsValue = computeNiceSteps(maxValue || 100);
    const displayYStepsQty = computeNiceSteps(maxQty || 10);

    const yTopValue = displayYStepsValue[displayYStepsValue.length - 1] || 1;
    const yTopQty = displayYStepsQty[displayYStepsQty.length - 1] || 1;

    const barWidth = inventoryBreakdownData.length > 8 ? 45 : 60;
    const gap = (chartWidth - (inventoryBreakdownData.length * barWidth)) / (inventoryBreakdownData.length + 1);

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
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
        >
          {/* Axis Baseline */}
          <line x1={paddingLeft} y1={baselineY} x2={width - paddingRight} y2={baselineY} stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />

          {/* Value Grid (Upwards) */}
          {(isCombine || isValueMode) && displayYStepsValue.map((step) => {
            const y = baselineY - (step / yTopValue) * valueZoneHeight;
            return (
              <g key={`val-${step}`}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#dee5ecff" strokeWidth="1.5" strokeDasharray="6 4" />
                <text x={paddingLeft - 15} y={y + 5} textAnchor="end" className="text-[15px] fill-slate-400 font-semibold">${step.toLocaleString()}</text>
              </g>
            );
          })}

          {/* Quantity Grid */}
          {(isCombine || isQtyMode) && displayYStepsQty.map((step, idx) => {
            if (step === 0 && !isQtyMode) return null; // Avoid overlapping baseline in combine mode
            const y = isCombine
              ? baselineY + (step / yTopQty) * qtyZoneHeight
              : baselineY - (step / yTopQty) * qtyZoneHeight; // Grow UP in regular mode

            return (
              <g key={`qty-${step}`}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f1f5f9" strokeWidth="1.5" strokeDasharray="6 4" />
                <text x={paddingLeft - 15} y={y + 5} textAnchor="end" className="text-[15px] fill-slate-400 font-semibold">{step}</text>
              </g>
            );
          })}

          {inventoryBreakdownData.map((cat, i) => {
            const vHeight = (cat.value / yTopValue) * valueZoneHeight;
            const qHeight = (cat.quantity / yTopQty) * qtyZoneHeight;
            const xPos = paddingLeft + gap + (i * (barWidth + gap));
            const isHovered = hoveredCategoryIdx === i;

            return (
              <g
                key={i}
                onMouseLeave={() => setHoveredCategoryIdx(null)}
                className="transition-all"
              >
                {/* Interaction Overlay */}
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

                {isHovered && (
                  <rect
                    x={xPos - gap / 2}
                    y={paddingTop}
                    width={barWidth + gap}
                    height={chartHeight}
                    fill="#f8fafc"
                    rx="12"
                    className="animate-in fade-in duration-200 pointer-events-none"
                  />
                )}

                {/* Value Bar (Top) */}
                {(isCombine || isValueMode) && (
                  <rect
                    x={xPos}
                    y={baselineY - vHeight}
                    width={barWidth}
                    height={vHeight}
                    fill={cat.color}
                    rx="6"
                    className={`transition-all duration-500 pointer-events-none ${isHovered ? 'brightness-110 shadow-lg' : 'opacity-95'}`}
                  />
                )}

                {/* Quantity Bar */}
                {(isCombine || isQtyMode) && (
                  <rect
                    x={xPos}
                    y={isCombine ? baselineY : baselineY - qHeight}
                    width={barWidth}
                    height={qHeight}
                    fill={cat.color}
                    fillOpacity={isCombine ? "0.4" : "1"}
                    rx="6"
                    className={`transition-all duration-500 pointer-events-none ${isHovered ? 'opacity-100 brightness-110 shadow-lg' : (isCombine ? 'opacity-60' : 'opacity-95')}`}
                  />
                )}

                <text
                  x={xPos + barWidth / 2}
                  y={height - paddingBottom + 35}
                  textAnchor="middle"
                  className={`text-[16px] font-medium tracking-tight transition-colors pointer-events-none ${isHovered ? 'fill-slate-900' : 'fill-slate-600'}`}
                >
                  {cat.label}
                </text>
              </g>
            );
          })}

          {isCombine && (
            <>
              <text x={paddingLeft - 80} y={paddingTop - 35} textAnchor="start" className="text-[14px] font-extrabold fill-slate-600 uppercase tracking-widest rotate-[-90] origin-left">Value ($)</text>
              <text x={paddingLeft - 65} y={height - paddingBottom + 15} textAnchor="start" className="text-[14px] font-extrabold fill-slate-600 uppercase tracking-widest rotate-[-90] origin-left">Qty (#)</text>
            </>
          )}
        </svg>

        {hoveredCategoryIdx !== null && (
          <div
            className="absolute pointer-events-none z-[500] animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: `${catMousePos.x}px`,
              top: `${catMousePos.y}px`,
              transform: 'translate(-50%, -100%) translateY(-20px)',
            }}
          >
            <div className="bg-white rounded-2xl p-4 shadow-2xl border border-slate-100 min-w-[200px]">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: inventoryBreakdownData[hoveredCategoryIdx].color }} />
                <p className="text-sm font-black text-slate-800">{inventoryBreakdownData[hoveredCategoryIdx].label}</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Value</span>
                  <span className={`text-xs font-black ${isValueMode || isCombine ? 'text-blue-600' : 'text-slate-400'}`}>${inventoryBreakdownData[hoveredCategoryIdx].value.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Units</span>
                  <span className={`text-xs font-black ${isQtyMode || isCombine ? 'text-emerald-600' : 'text-slate-400'}`}>{inventoryBreakdownData[hoveredCategoryIdx].quantity.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDistributionChart = () => {
    const defaultColors = ['#2563eb', '#facc15', '#f97316', '#db2777', '#9333ea', '#dc2626', '#10b981'];
    const size = 250;
    const center = size / 2;
    const radius = 70;
    const strokeWidth = 28;
    const { data, totalValue, isReorderReport, isQuantityReport, symbol } = currentBreakdown;

    return (
      <>
        <style>{`
          @keyframes slow-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-donut-spin {
            animation: slow-spin 40s linear infinite;
          }
        `}</style>
        <div className="flex flex-col items-center py-2 border-b border-slate-50 w-full">
          <div
            className="relative w-full flex justify-center"
            ref={distContainerRef}
            onMouseMove={handleDonutMouseMove}
            onMouseEnter={() => setIsMouseOverDist(true)}
            onMouseLeave={() => setIsMouseOverDist(false)}
          >
            <svg width={size} height={260} viewBox={`0 0 ${size} 260`} className="overflow-visible">
              <g
                className="animate-donut-spin"
                style={{
                  transformOrigin: `${center}px ${center}px`,
                  animationPlayState: hoveredDistIdx !== null ? 'paused' : 'running'
                }}
              >
                {(() => {
                  let cumulativeAngle = -Math.PI / 2;
                  return data.map((v, idx) => {
                    if (v.amount === 0) return null;
                    const angle = (v.amount / totalValue) * 2 * Math.PI;
                    const x1 = center + radius * Math.cos(cumulativeAngle);
                    const y1 = center + radius * Math.sin(cumulativeAngle);
                    cumulativeAngle += angle;
                    const x2 = center + radius * Math.cos(cumulativeAngle);
                    const y2 = center + radius * Math.sin(cumulativeAngle);
                    const largeArcFlag = angle > Math.PI ? 1 : 0;
                    const isFullCircle = angle >= (2 * Math.PI - 0.001);
                    const pathData = isFullCircle ? '' : `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
                    const isHovered = hoveredDistIdx === idx;
                    const color = breakdownType === 'category' ? getCategoryColor(v.id) : defaultColors[idx % defaultColors.length];

                    return (
                      <g key={v.id}>
                        {isFullCircle ? (
                          <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
                            className="transition-all duration-300 cursor-pointer origin-center"
                            style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)', opacity: (hoveredDistIdx !== null && !isHovered) ? 0.3 : 1 }}
                            onMouseEnter={() => setHoveredDistIdx(idx)} onMouseLeave={() => setHoveredDistIdx(null)} />
                        ) : (
                          <path d={pathData} fill="none" stroke={color} strokeWidth={strokeWidth}
                            className="transition-all duration-300 cursor-pointer origin-center"
                            style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)', opacity: (hoveredDistIdx !== null && !isHovered) ? 0.3 : 1 }}
                            onMouseEnter={() => setHoveredDistIdx(idx)} onMouseLeave={() => setHoveredDistIdx(null)} />
                        )}
                      </g>
                    );
                  });
                })()}
              </g>
              <g className="pointer-events-none">
                <text x={center} y={center - 5} textAnchor="middle" className="text-[9px] font-black text-slate-400 fill-slate-400 uppercase tracking-widest">
                  {hoveredDistIdx !== null ? data[hoveredDistIdx].label : 'Total'}
                </text>
                <text x={center} y={center + 15} textAnchor="middle" className="text-lg font-black fill-slate-800">
                  {hoveredDistIdx !== null
                    ? (isReorderReport || isQuantityReport
                      ? data[hoveredDistIdx].amount.toLocaleString()
                      : `$${data[hoveredDistIdx].amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)
                    : (isReorderReport || isQuantityReport
                      ? totalValue.toLocaleString()
                      : `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)}
                </text>
              </g>
            </svg>

            {hoveredDistIdx !== null && isMouseOverDist && data[hoveredDistIdx].amount > 0 && (
              <div
                className="absolute top-0 left-0 z-[500] pointer-events-none will-change-transform transition-all duration-300 ease-out"
                style={{
                  transform: `translate3d(${distMousePos.x}px, ${distMousePos.y}px, 0) translate(${distMousePos.x < 70 ? '0%' : (distMousePos.x > distMousePos.containerWidth - 70 ? '-100%' : '-50%')}, -115%)`
                }}
              >
                <div className="bg-white border border-slate-100 rounded-[1.25rem] p-4 flex flex-col items-center text-center min-w-[130px] shadow-sm">
                  <span className="text-[10px] font-bold text-slate-500 leading-none mb-1.5 tracking-wide">{data[hoveredDistIdx].label}</span>
                  <span className="text-sm font-black text-slate-800 leading-none mb-1.5">
                    {isReorderReport ? `${data[hoveredDistIdx].amount} Reorders` : (isQuantityReport ? `${data[hoveredDistIdx].amount} Units` : `$${data[hoveredDistIdx].amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100/50">
                    {data[hoveredDistIdx].percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 w-full max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {data.map((v, idx) => {
            const color = breakdownType === 'category' ? getCategoryColor(v.id) : defaultColors[idx % defaultColors.length];
            return (
              <div
                key={v.id}
                className="flex flex-col gap-2.5 transition-opacity cursor-pointer group w-full"
                style={{ opacity: (hoveredDistIdx !== null && hoveredDistIdx !== idx) ? 0.5 : 1 }}
                onMouseEnter={() => setHoveredDistIdx(idx)}
                onMouseLeave={() => setHoveredDistIdx(null)}
              >
                <div className="flex items-center justify-between gap-4 w-full">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:border-emerald-100 transition-colors shrink-0">
                      {v.icon || <Package />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] font-black text-slate-800 leading-none mb-1 tracking-wide truncate">{v.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500 leading-tight">
                          {v.percentage.toFixed(1)}% share
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-slate-800">
                      {isReorderReport || isQuantityReport ? v.amount.toLocaleString() : `$${v.amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${v.percentage}%`,
                      backgroundColor: color,
                      boxShadow: (hoveredDistIdx === idx) ? `0 0 12px ${color}80` : `0 0 8px ${color}40`
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </>
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
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 overflow-y-auto flex flex-col relative w-full">
        <Header
          title={sidebarItem === 'dashboard' ? 'Admin Overview' : (sidebarItem === 'users' ? 'User Directory' : sidebarItem)}
          users={users}
          selectedUserId={selectedUserId}
          onUserSelect={handleSelectUser}
          onMenuClick={() => setIsSidebarOpen(true)}
        />

        <div className="px-0 py-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 w-full">
          {sidebarItem === 'dashboard' && (
            <>
              <div className="px-4 sm:px-0">
                <StatsCards inventory={globalInventory} history={globalHistory} expiring={expiringGlobalItems} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-6 lg:mb-8">
                {/* CATEGORY BREAKDOWN */}
                <div className="bg-white rounded-none sm:rounded-[2.5rem] shadow-sm border border-slate-100 px-4 py-8 sm:p-6 lg:p-8 group transition-all">
                  <div className="mb-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-black text-slate-800">Current Inventory Breakdown</h3>
                        <div className="text-xs text-slate-400 flex items-center gap-1 font-bold">
                          <span className="bg-indigo-50 p-1 rounded-md">
                            <Info size={12} className="text-indigo-600" />
                          </span>
                          <span className="uppercase tracking-wide">
                            {inventoryDimension === 'category' ? 'By Category' : 'By Vendor'}
                          </span>
                          <span className="text-slate-300 mx-1">|</span>
                          <span className="uppercase tracking-wide">
                            {categoryViewMode === 'combine' ? 'Value & Qty' : (categoryViewMode === 'value' ? 'Value' : 'Quantity')}
                          </span>
                          <span className="text-slate-300 mx-1">|</span>
                          <span className="uppercase tracking-wide">
                            {inventoryBreakdownPeriod === 'all' ? 'All Time' : formatPeriodName(inventoryBreakdownPeriod)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mb-16 sm:mb-18">
                      {/* Period Filter */}
                      <div className="relative" ref={invPeriodDropdownRef}>
                        <button
                          onClick={() => setIsInvPeriodDropdownOpen(!isInvPeriodDropdownOpen)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl shadow-sm hover:border-blue-600 transition-all group"
                        >
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                            {inventoryBreakdownPeriod === 'all' ? 'All Time' : formatPeriodName(inventoryBreakdownPeriod)}
                          </span>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isInvPeriodDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isInvPeriodDropdownOpen && (
                          <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
                              <button
                                onClick={() => { setInventoryBreakdownPeriod('all'); setIsInvPeriodDropdownOpen(false); }}
                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${inventoryBreakdownPeriod === 'all' ? 'bg-slate-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <Filter className="w-4 h-4 text-blue-600" />
                                  <span className="text-xs font-bold">All Time</span>
                                </div>
                                {inventoryBreakdownPeriod === 'all' && <Check className="w-3 h-3 text-emerald-500" />}
                              </button>
                              {availableMonths.map((month) => (
                                <button
                                  key={month}
                                  onClick={() => { setInventoryBreakdownPeriod(month); setIsInvPeriodDropdownOpen(false); }}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${inventoryBreakdownPeriod === month ? 'bg-slate-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-400" />
                                    <span className="text-xs font-bold">{formatPeriodName(month)}</span>
                                  </div>
                                  {inventoryBreakdownPeriod === month && <Check className="w-3 h-3 text-emerald-500" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Dimension Switcher */}
                      <div className="relative" ref={invDimensionDropdownRef}>
                        <button
                          onClick={() => setIsInvDimensionDropdownOpen(!isInvDimensionDropdownOpen)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl shadow-sm hover:border-orange-600 transition-all group"
                        >
                          {inventoryDimension === 'category' ? <PieChart className="w-4 h-4 text-orange-600" /> : <Building2 className="w-4 h-4 text-emerald-600" />}
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                            {inventoryDimension}
                          </span>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isInvDimensionDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isInvDimensionDropdownOpen && (
                          <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-2 space-y-1">
                              {[
                                { id: 'category', label: 'By Category', icon: <PieChart className="w-4 h-4" />, color: 'text-orange-600' },
                                { id: 'vendor', label: 'By Vendor', icon: <Building2 className="w-4 h-4" />, color: 'text-emerald-600' }
                              ].map((dim) => (
                                <button
                                  key={dim.id}
                                  onClick={() => { setInventoryDimension(dim.id as any); setIsInvDimensionDropdownOpen(false); }}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${inventoryDimension === dim.id ? 'bg-slate-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg bg-white shadow-sm ${dim.color}`}>
                                      {dim.icon}
                                    </div>
                                    <span className="text-xs font-bold">{dim.label}</span>
                                  </div>
                                  {inventoryDimension === dim.id && <Check className="w-3 h-3 text-emerald-500" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* View Mode Dropdown */}
                      <div className="relative" ref={catViewDropdownRef}>
                        <button
                          onClick={() => setIsCatViewDropdownOpen(!isCatViewDropdownOpen)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl shadow-sm hover:border-blue-600 transition-all group"
                        >
                          {categoryViewMode === 'combine' ? <Layout className="w-4 h-4 text-blue-600" /> : (categoryViewMode === 'value' ? <DollarSign className="w-4 h-4 text-emerald-600" /> : <Hash className="w-4 h-4 text-indigo-600" />)}
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                            {categoryViewMode === 'combine' ? 'Value & Qty' : (categoryViewMode === 'value' ? 'Value' : 'Quantity')}
                          </span>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isCatViewDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isCatViewDropdownOpen && (
                          <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-2 space-y-1">
                              {[
                                { id: 'combine', label: 'Combine View', icon: <Layout className="w-4 h-4" />, color: 'text-blue-600' },
                                { id: 'value', label: 'Value Only', icon: <DollarSign className="w-4 h-4" />, color: 'text-emerald-600' },
                                { id: 'quantity', label: 'Quantity Only', icon: <Hash className="w-4 h-4" />, color: 'text-indigo-600' }
                              ].map((mode) => (
                                <button
                                  key={mode.id}
                                  onClick={() => { setCategoryViewMode(mode.id as any); setIsCatViewDropdownOpen(false); }}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${categoryViewMode === mode.id ? 'bg-slate-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg bg-white shadow-sm ${mode.color}`}>
                                      {mode.icon}
                                    </div>
                                    <span className="text-xs font-bold">{mode.label}</span>
                                  </div>
                                  {categoryViewMode === mode.id && <Check className="w-3 h-3 text-emerald-500" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {renderCategoryChart()}
                </div>

                {/* CLINIC DISTRIBUTION */}
                <div className="bg-white rounded-none sm:rounded-[1.5rem] shadow-sm border border-slate-100 px-4 py-8 sm:p-6 lg:p-8 group transition-all flex flex-col gap-6 relative z-50">
                  <div className="mb-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-black text-slate-900">Clinic Distribution</h3>
                        <div className="text-xs text-slate-400 flex items-center gap-1 font-bold">
                          <span className="bg-emerald-50 p-1 rounded-md">
                            <Info size={12} className="text-emerald-600" />
                          </span>
                          <span className="uppercase tracking-wide">
                            {currentBreakdownOption.label}
                          </span>
                          <span className="text-slate-300 mx-1">|</span>
                          <span className="uppercase tracking-wide">
                            {distributionPeriod === 'all' ? 'All Time' : formatPeriodName(distributionPeriod)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Period Dropdown */}
                      <div className="relative" ref={periodDropdownRef}>
                        <button
                          onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl shadow-sm hover:border-emerald-600 transition-all group"
                        >
                          <Clock className="w-4 h-4 text-emerald-600" />
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                            {distributionPeriod === 'all' ? 'All Time' : formatPeriodName(distributionPeriod)}
                          </span>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isPeriodDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isPeriodDropdownOpen && (
                          <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto">
                              <button
                                onClick={() => { setDistributionPeriod('all'); setIsPeriodDropdownOpen(false); }}
                                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${distributionPeriod === 'all' ? 'bg-slate-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <Filter className="w-4 h-4 text-emerald-600" />
                                  <span className="text-xs font-bold">All Time</span>
                                </div>
                                {distributionPeriod === 'all' && <Check className="w-3 h-3 text-emerald-500" />}
                              </button>
                              {availableMonths.map(month => (
                                <button
                                  key={month}
                                  onClick={() => { setDistributionPeriod(month); setIsPeriodDropdownOpen(false); }}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${distributionPeriod === month ? 'bg-slate-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-slate-400" />
                                    <span className="text-xs font-bold">{formatPeriodName(month)}</span>
                                  </div>
                                  {distributionPeriod === month && <Check className="w-3 h-3 text-emerald-500" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Breakdown Dropdown */}
                      <div className="relative" ref={breakdownDropdownRef}>
                        <button
                          onClick={() => setIsBreakdownDropdownOpen(!isBreakdownDropdownOpen)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl shadow-sm hover:border-blue-600 transition-all group"
                        >
                          <div className="text-blue-600">
                            {currentBreakdownOption.icon}
                          </div>
                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                            {currentBreakdownOption.label.replace('By ', '')}
                          </span>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isBreakdownDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isBreakdownDropdownOpen && (
                          <div className="absolute top-full left-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-2 space-y-1">
                              {breakdownOptions.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => {
                                    setBreakdownType(opt.value as any);
                                    setIsBreakdownDropdownOpen(false);
                                  }}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${breakdownType === opt.value ? 'bg-slate-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`p-1.5 rounded-lg bg-white shadow-sm ${breakdownType === opt.value ? 'text-blue-600' : 'text-slate-400'}`}>
                                      {opt.icon}
                                    </div>
                                    <span className="text-xs font-bold">{opt.label}</span>
                                  </div>
                                  {breakdownType === opt.value && <Check className="w-3 h-3 text-emerald-500" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {currentBreakdown.data.length > 0 ? (
                    renderDistributionChart()
                  ) : (
                    <div className="h-[340px] flex flex-col items-center justify-center text-slate-400 gap-2 border border-dashed border-slate-200 rounded-xl">
                      <ShoppingCart size={32} className="opacity-20" />
                      <p className="text-xs font-medium">No purchase data for this period</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-none sm:rounded-[2.5rem] border border-slate-100 px-4 py-8 sm:p-6 lg:p-8 shadow-sm flex flex-col gap-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Spending Analysis</h3>
                    <p className="text-xs text-slate-400 font-medium">Analyzing {selectedUser ? `${selectedUser.name}'s (${selectedUser.clinicName})` : 'global'} financial data</p>
                  </div>
                  <div className="bg-slate-50 p-1 rounded-xl border border-slate-100 flex gap-1 self-start sm:self-auto">
                    <button onClick={() => setAnalysisMode('single')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${analysisMode === 'single' ? 'bg-white text-[#2563eb] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Single Period</button>
                    <button onClick={() => setAnalysisMode('compare')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${analysisMode === 'compare' ? 'bg-white text-[#f97316] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Compare Months</button>
                  </div>
                </div>

                <div className="flex flex-col gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 tracking-wider">Period A (Primary)</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="month" value={spPeriodA} onChange={(e) => setSpPeriodA(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all" />
                      </div>
                    </div>

                    {analysisMode === 'compare' ? (
                      <div className="flex flex-col gap-1.5 animate-in slide-in-from-right-2 duration-300">
                        <label className="text-[10px] font-bold text-slate-500 tracking-wider">Period B (Compare To)</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input type="month" value={spPeriodB} onChange={(e) => setSpPeriodB(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#f97316]/20 transition-all" />
                        </div>
                      </div>
                    ) : (
                      <div className="hidden lg:flex flex-col gap-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-0">Spacer</label>
                        <div className="h-[46px] flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-widest bg-white/50 border border-dashed border-slate-200 rounded-xl">
                          Comparative Mode Off
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                        <Filter className="w-3 h-3" /> Category
                      </label>
                      <div className="relative" ref={spCategoryDropdownRef}>
                        <button onClick={() => setIsSpCategoryOpen(!isSpCategoryOpen)} className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#2563eb] transition-all">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="p-1.5 bg-blue-50 text-[#2563eb] rounded-lg shrink-0">{currentSpCategoryOption?.icon}</div>
                            <span className="text-[13px] font-bold text-slate-700 truncate">{currentSpCategoryOption?.label}</span>
                          </div>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isSpCategoryOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isSpCategoryOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-1.5 space-y-0.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                              <button onClick={() => { setSelectedSpCategory('all'); setIsSpCategoryOpen(false); }} className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-[11px] font-bold ${selectedSpCategory === 'all' ? 'bg-blue-50 text-[#2563eb]' : 'hover:bg-slate-50 text-slate-600'}`}>
                                <Filter className="w-3 h-3" /> All Categories
                              </button>
                              {CATEGORIES.map(opt => (
                                <button key={opt.id} onClick={() => { setSelectedSpCategory(opt.id); setIsSpCategoryOpen(false); }} className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-[11px] font-bold ${selectedSpCategory === opt.id ? 'bg-blue-50 text-[#2563eb]' : 'hover:bg-slate-50 text-slate-600'}`}>
                                  <div className={`p-1 rounded-md ${selectedSpCategory === opt.id ? 'bg-white text-[#2563eb]' : 'bg-slate-100 text-slate-400'}`}>{opt.icon}</div>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                        <Building2 className="w-3 h-3" /> Vendor
                      </label>
                      <div className="relative" ref={spVendorDropdownRef}>
                        <button onClick={() => setIsSpVendorOpen(!isSpVendorOpen)} className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#2563eb] transition-all">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="p-1.5 bg-blue-50 text-[#2563eb] rounded-lg shrink-0">{currentSpVendorOption?.icon}</div>
                            <span className="text-[13px] font-bold text-slate-700 truncate">{currentSpVendorOption?.label}</span>
                          </div>
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isSpVendorOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isSpVendorOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="p-1.5 space-y-0.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                              {spVendorOptions.map(opt => (
                                <button key={opt.id} onClick={() => { setSelectedSpVendor(opt.id); setIsSpVendorOpen(false); }} className={`w-full flex items-center gap-2 p-2.5 rounded-lg text-[11px] font-bold ${selectedSpVendor === opt.id ? 'bg-blue-50 text-[#2563eb]' : 'hover:bg-slate-50 text-slate-600'}`}>
                                  <div className={`p-1 rounded-md ${selectedSpVendor === opt.id ? 'bg-white text-[#2563eb]' : 'bg-slate-100 text-slate-400'}`}>{opt.icon}</div>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
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
                  selectedCategory={selectedSpCategory}
                  selectedVendor={selectedSpVendor}
                  windowWidth={windowWidth}
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
