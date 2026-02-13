
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  BarChart3,
  Building2,
  Layout,
  PackageSearch,
  PieChart,
  RefreshCw,
  ChevronDown,
  Calendar,
  ArrowUpRight,
  TrendingUp,
  Package,
  Filter,
  Check,
  Store,
  Clock,
  DollarSign,
  Hash,
  Info
} from 'lucide-react';
import { PurchaseHistory, Item } from './types';
import { CATEGORIES } from './constants';

interface ClinicAnalyticsProps {
  history: PurchaseHistory[];
  inventory?: Item[];
}

const ClinicAnalytics: React.FC<ClinicAnalyticsProps> = ({ history, inventory = [] }) => {
  const [breakdownType, setBreakdownType] = useState<'category' | 'vendor' | 'product' | 'reorder'>('category');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [isMouseOverSVG, setIsMouseOverSVG] = useState(false);
  const [chartHoveredDay, setChartHoveredDay] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, containerWidth: 0 });

  const [isBreakdownDropdownOpen, setIsBreakdownDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const breakdownDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const catViewDropdownRef = useRef<HTMLDivElement>(null);
  const invDimensionDropdownRef = useRef<HTMLDivElement>(null);
  const invPeriodDropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  // Spending Analysis States
  const [analysisMode, setAnalysisMode] = useState<'single' | 'compare'>('single');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedVendor, setSelectedVendor] = useState<string>('all');

  // Clinic Distribution Period State
  const [distributionPeriod, setDistributionPeriod] = useState<string>('all');

  // Category Chart State
  const [categoryViewMode, setCategoryViewMode] = useState<'value' | 'quantity' | 'combine'>('combine');
  const [inventoryDimension, setInventoryDimension] = useState<'category' | 'vendor'>('category');
  const [inventoryBreakdownPeriod, setInventoryBreakdownPeriod] = useState<string>('all');
  const [isCatViewDropdownOpen, setIsCatViewDropdownOpen] = useState(false);
  const [isInvDimensionDropdownOpen, setIsInvDimensionDropdownOpen] = useState(false);
  const [isInvPeriodDropdownOpen, setIsInvPeriodDropdownOpen] = useState(false);
  const [hoveredCategoryIdx, setHoveredCategoryIdx] = useState<number | null>(null);
  const [catMousePos, setCatMousePos] = useState({ x: 0, y: 0 });
  const catChartRef = useRef<SVGSVGElement>(null);

  const [periodA, setPeriodA] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [periodB, setPeriodB] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (breakdownDropdownRef.current && !breakdownDropdownRef.current.contains(event.target as Node)) {
        setIsBreakdownDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(event.target as Node)) {
        setIsVendorDropdownOpen(false);
      }
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(event.target as Node)) {
        setIsPeriodDropdownOpen(false);
      }
      if (catViewDropdownRef.current && !catViewDropdownRef.current.contains(event.target as Node)) {
        setIsCatViewDropdownOpen(false);
      }
      if (invDimensionDropdownRef.current && !invDimensionDropdownRef.current.contains(event.target as Node)) {
        setIsInvDimensionDropdownOpen(false);
      }
      if (invPeriodDropdownRef.current && !invPeriodDropdownRef.current.contains(event.target as Node)) {
        setIsInvPeriodDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizeKey = (value: string | null | undefined, fallback: string) => {
    const key = (value || '').trim().toLowerCase();
    return key || fallback.toLowerCase();
  };

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

  // Top Vendors Logic for Filtering (case-insensitive aggregation)
  const topVendorsForFilter = useMemo(() => {
    const vendorMap: Record<string, { amount: number; label: string }> = {};
    history.forEach(h => {
      const norm = normalizeKey(h.vendor, 'Unknown Vendor');
      if (!vendorMap[norm]) vendorMap[norm] = { amount: 0, label: h.vendor || 'Unknown Vendor' };
      vendorMap[norm].amount += h.totalPrice;
    });

    const sortedVendors = Object.entries(vendorMap)
      .map(([_, { amount, label }]) => ({ name: label, spend: amount }))
      .sort((a, b) => b.spend - a.spend);

    const top5 = sortedVendors.slice(0, 5).map(v => v.name);
    const others = sortedVendors.slice(5).map(v => v.name);

    return { top5, others };
  }, [history]);

  // Extract unique months for the distribution period filter
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    history.forEach(h => {
      const d = new Date(h.timestamp);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [history]);

  const distributionHistory = useMemo(() => {
    if (distributionPeriod === 'all') return history;
    const [y, m] = distributionPeriod.split('-').map(Number);
    return history.filter(h => {
      const d = new Date(h.timestamp);
      return d.getFullYear() === y && (d.getMonth() + 1) === m;
    });
  }, [history, distributionPeriod]);

  const usageStats = useMemo(() => {
    const totalExpense = distributionHistory.reduce((acc, curr) => acc + curr.totalPrice, 0);
    const totalQuantity = distributionHistory.reduce((acc, curr) => acc + curr.qty, 0);
    const totalReorders = distributionHistory.length;

    // Category Breakdown
    const categoryBreakdown = CATEGORIES.map(cat => {
      const catHistory = distributionHistory.filter(h => h.category === cat.id);
      const amount = catHistory.reduce((acc, curr) => acc + curr.totalPrice, 0);
      const count = catHistory.length;
      const percentage = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;
      return {
        ...cat,
        amount,
        count,
        totalSpent: amount,
        percentage
      };
    }).sort((a, b) => b.amount - a.amount);

    // Vendor Breakdown
    const vendorMap: Record<string, { amount: number; count: number; label: string }> = {};
    distributionHistory.forEach(h => {
      const norm = normalizeKey(h.vendor, 'Unknown Vendor');
      const displayLabel = h.vendor || 'Unknown Vendor';
      if (!vendorMap[norm]) vendorMap[norm] = { amount: 0, count: 0, label: displayLabel };
      vendorMap[norm].amount += h.totalPrice;
      vendorMap[norm].count += 1;
    });

    const vendorSortedList = Object.entries(vendorMap)
      .map(([id, stats]) => ({
        id,
        label: stats.label,
        amount: stats.amount,
        count: stats.count,
        totalSpent: stats.amount,
        percentage: totalExpense > 0 ? (stats.amount / totalExpense) * 100 : 0,
        icon: <Building2 className="w-4 h-4" />
      }))
      .sort((a, b) => b.amount - a.amount);

    let finalVendorBreakdown = vendorSortedList.length > 5
      ? [...vendorSortedList.slice(0, 5), {
        id: 'others-vendor',
        label: 'Others',
        amount: vendorSortedList.slice(5).reduce((acc, v) => acc + v.amount, 0),
        count: vendorSortedList.slice(5).reduce((acc, v) => acc + v.count, 0),
        totalSpent: vendorSortedList.slice(5).reduce((acc, v) => acc + v.amount, 0),
        percentage: totalExpense > 0 ? (vendorSortedList.slice(5).reduce((acc, v) => acc + v.amount, 0) / totalExpense) * 100 : 0,
        icon: <Layout className="w-4 h-4" />
      }]
      : vendorSortedList;

    // Product Consumption Breakdown
    const productMap: Record<string, { qty: number; count: number; totalSpent: number; label: string }> = {};
    distributionHistory.forEach(h => {
      const norm = normalizeKey(h.productName, 'Unknown Product');
      const displayLabel = h.productName || 'Unknown Product';
      if (!productMap[norm]) productMap[norm] = { qty: 0, count: 0, totalSpent: 0, label: displayLabel };
      productMap[norm].qty += h.qty;
      productMap[norm].count += 1;
      productMap[norm].totalSpent += h.totalPrice;
    });

    const productSortedList = Object.entries(productMap)
      .map(([id, stats]) => ({
        id,
        label: stats.label,
        amount: stats.qty,
        count: stats.count,
        totalSpent: stats.totalSpent,
        percentage: totalQuantity > 0 ? (stats.qty / totalQuantity) * 100 : 0,
        icon: <PackageSearch className="w-4 h-4" />
      }))
      .sort((a, b) => b.amount - a.amount);

    let finalProductBreakdown = productSortedList.length > 5
      ? [...productSortedList.slice(0, 5), {
        id: 'others-product',
        label: 'Other Products',
        amount: productSortedList.slice(5).reduce((acc, p) => acc + p.amount, 0),
        count: productSortedList.slice(5).reduce((acc, p) => acc + p.count, 0),
        totalSpent: productSortedList.slice(5).reduce((acc, p) => acc + p.totalSpent, 0),
        percentage: totalQuantity > 0 ? (productSortedList.slice(5).reduce((acc, p) => acc + p.amount, 0) / totalQuantity) * 100 : 0,
        icon: <Layout className="w-4 h-4" />
      }]
      : productSortedList;

    // Most Reordered Products
    const reorderSortedList = Object.entries(productMap)
      .map(([name, stats]) => ({
        id: `reorder-${name}`,
        label: name,
        amount: stats.count,
        totalQty: stats.qty,
        count: stats.count,
        totalSpent: stats.totalSpent,
        percentage: totalReorders > 0 ? (stats.count / totalReorders) * 100 : 0,
        icon: <RefreshCw className="w-4 h-4" />
      }))
      .sort((a, b) => b.count - a.count);

    let finalReorderBreakdown = reorderSortedList.length > 5
      ? [...reorderSortedList.slice(0, 5), {
        id: 'others-reorder',
        label: 'Others',
        amount: reorderSortedList.slice(5).reduce((acc, p) => acc + p.count, 0),
        totalQty: reorderSortedList.slice(5).reduce((acc, p) => acc + p.totalQty, 0),
        count: reorderSortedList.slice(5).reduce((acc, p) => acc + p.count, 0),
        totalSpent: reorderSortedList.slice(5).reduce((acc, p) => acc + p.totalSpent, 0),
        percentage: totalReorders > 0 ? (reorderSortedList.slice(5).reduce((acc, p) => acc + p.count, 0) / totalReorders) * 100 : 0,
        icon: <Layout className="w-4 h-4" />
      }]
      : reorderSortedList;

    return {
      totalExpense,
      totalQuantity,
      totalReorders,
      categoryBreakdown,
      vendorBreakdown: finalVendorBreakdown,
      productBreakdown: finalProductBreakdown,
      reorderBreakdown: finalReorderBreakdown
    };
  }, [distributionHistory]);

  const spendingAnalysisData = useMemo(() => {
    const getDaysInMonth = (monthStr: string) => {
      const [year, month] = monthStr.split('-').map(Number);
      return new Date(year, month, 0).getDate();
    };

    const processMonth = (monthStr: string) => {
      const days = getDaysInMonth(monthStr);
      const data = Array(days).fill(0);
      const [targetYear, targetMonth] = monthStr.split('-').map(Number);

      let total = 0;
      history.forEach(h => {
        // Apply Category Filter
        if (selectedCategory !== 'all' && h.category !== selectedCategory) return;

        // Apply Vendor Filter
        if (selectedVendor !== 'all') {
          if (selectedVendor === 'others_vendors_filter') {
            if (topVendorsForFilter.top5.includes(h.vendor || 'Unknown')) return;
          } else {
            if (h.vendor !== selectedVendor) return;
          }
        }

        const d = new Date(h.timestamp);
        if (d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth) {
          const day = d.getDate();
          data[day - 1] += h.totalPrice;
          total += h.totalPrice;
        }
      });
      return { data, total, days };
    };

    const periodAStats = processMonth(periodA);
    const periodBStats = processMonth(periodB);

    const maxDataVal = Math.max(...periodAStats.data, ...periodBStats.data, 100);
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

    const growth = periodBStats.total > 0
      ? ((periodAStats.total - periodBStats.total) / periodBStats.total) * 100
      : 0;

    const multiplier = periodBStats.total > 0 ? (periodAStats.total / periodBStats.total).toFixed(1) : '0';
    return { periodAStats, periodBStats, maxVal, yAxisSteps, growth, multiplier };
  }, [history, periodA, periodB, selectedCategory, selectedVendor, topVendorsForFilter]);

  const inventoryBreakdownData = useMemo(() => {
    let filteredInventory = inventory;
    if (inventoryBreakdownPeriod !== 'all') {
      const [y, m] = inventoryBreakdownPeriod.split('-').map(Number);
      filteredInventory = inventory.filter(i => {
        if (!i.createdAt) return false;
        const d = new Date(i.createdAt);
        return d.getFullYear() === y && (d.getMonth() + 1) === m;
      });
    }

    if (inventoryDimension === 'category') {
      return CATEGORIES.map(cat => {
        const items = filteredInventory.filter(i => (i.category || 'other').toLowerCase() === cat.id.toLowerCase());
        const value = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const quantity = items.reduce((sum, i) => sum + i.quantity, 0);
        return {
          id: cat.id,
          label: cat.label,
          value,
          quantity,
          color: getCategoryColor(cat.id)
        };
      }).sort((a, b) => b.value - a.value);
    } else {
      const vendorSums: Record<string, { value: number; quantity: number }> = {};
      filteredInventory.forEach(i => {
        const v = (i.vendor || 'Unknown').trim();
        if (!vendorSums[v]) vendorSums[v] = { value: 0, quantity: 0 };
        vendorSums[v].value += (i.price * i.quantity);
        vendorSums[v].quantity += i.quantity;
      });

      const palette = ['#2563eb', '#facc15', '#f97316', '#db2777', '#9333ea', '#94a3b8'];

      const allVendors = Object.entries(vendorSums)
        .map(([name, stats]) => ({
          id: name,
          label: name,
          value: stats.value,
          quantity: stats.quantity,
        }))
        .sort((a, b) => b.value - a.value);

      const top5 = allVendors.slice(0, 5);
      const remaining = allVendors.slice(5);

      const result = top5.map((v, idx) => ({
        ...v,
        color: palette[idx % palette.length]
      }));

      if (remaining.length > 0) {
        const othersValue = remaining.reduce((sum, v) => sum + v.value, 0);
        const othersQty = remaining.reduce((sum, v) => sum + v.quantity, 0);
        result.push({
          id: 'others',
          label: 'Others',
          value: othersValue,
          quantity: othersQty,
          color: palette[5] // slate-400 for Others
        });
      }

      return result;
    }
  }, [inventory, inventoryDimension, inventoryBreakdownPeriod]);

  const currentBreakdown = useMemo(() => {
    switch (breakdownType) {
      case 'category': return usageStats.categoryBreakdown;
      case 'vendor': return usageStats.vendorBreakdown;
      case 'product': return usageStats.productBreakdown;
      case 'reorder': return usageStats.reorderBreakdown;
      default: return usageStats.categoryBreakdown;
    }
  }, [breakdownType, usageStats]);

  const breakdownOptions = [
    { value: 'category', label: 'By Category', icon: <PieChart className="w-4 h-4" /> },
    { value: 'vendor', label: 'By Vendor', icon: <Building2 className="w-4 h-4" /> },
    { value: 'product', label: 'Most Consumed', icon: <PackageSearch className="w-4 h-4" /> },
    { value: 'reorder', label: 'Most Reordered', icon: <RefreshCw className="w-4 h-4" /> },
  ];

  const currentBreakdownOption = breakdownOptions.find(opt => opt.value === breakdownType) || breakdownOptions[0];

  const formatPeriodName = (period: string) => {
    if (period === 'all') return 'All Time';
    const [y, m] = period.split('-');
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const categoryOptions = [
    { id: 'all', label: 'All Categories', icon: <Filter className="w-4 h-4" /> },
    ...CATEGORIES
  ];

  const currentCategoryOption = categoryOptions.find(opt => opt.id === selectedCategory) || categoryOptions[0];

  const vendorOptions = useMemo(() => {
    const options = [{ id: 'all', label: 'All Vendors', icon: <Store className="w-4 h-4" /> }];
    topVendorsForFilter.top5.forEach(v => {
      options.push({ id: v, label: v, icon: <Building2 className="w-4 h-4" /> });
    });
    if (topVendorsForFilter.others.length > 0) {
      options.push({ id: 'others_vendors_filter', label: 'Minor Vendors (Others)', icon: <Layout className="w-4 h-4" /> });
    }
    return options;
  }, [topVendorsForFilter]);

  const currentVendorOption = vendorOptions.find(opt => opt.id === selectedVendor) || vendorOptions[0];

  const isQuantityReport = breakdownType === 'product';
  const isReorderReport = breakdownType === 'reorder';
  const totalValue = isReorderReport ? usageStats.totalReorders : (isQuantityReport ? usageStats.totalQuantity : usageStats.totalExpense);

  const handleDistributionMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      containerWidth: rect.width
    });
  };

  const handleChartInteraction = (clientX: number, clientY: number) => {
    const svg = chartRef.current;
    if (!svg) return;

    // Standard width/height of the SVG space
    const width = 1050;
    const padding = 40;
    const chartWidth = width - padding * 2;

    // High-precision SVG coordinate transformation
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;

    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return;

    const svgP = pt.matrixTransform(screenCTM.inverse());

    // Calculate which day we are over based on SVG internal units
    const chartX = svgP.x - padding;
    const dayIdx = Math.round((chartX / chartWidth) * 30);
    const dayClamped = Math.max(0, Math.min(30, dayIdx));

    const maxDays = analysisMode === 'compare'
      ? Math.max(spendingAnalysisData.periodAStats.data.length, spendingAnalysisData.periodBStats.data.length)
      : spendingAnalysisData.periodAStats.data.length;

    if (dayClamped >= maxDays) {
      setChartHoveredDay(null);
      return;
    }

    setChartHoveredDay(dayClamped);

    // Tooltip position relative to the wrapper div
    const parentRect = svg.parentElement?.getBoundingClientRect();
    if (parentRect) {
      setMousePos({
        x: clientX - parentRect.left,
        y: clientY - parentRect.top,
        containerWidth: parentRect.width
      });
    }
  };

  const handleChartMouse = (e: React.MouseEvent) => {
    handleChartInteraction(e.clientX, e.clientY);
  };

  const handleChartTouch = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleChartInteraction(touch.clientX, touch.clientY);
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
        if (steps.length > targetTicks + 2) break;
      }
      if (steps[steps.length - 1] !== niceMax) steps.push(niceMax);

      return steps;
    };

    const width = 800;
    const height = windowWidth < 640 ? 850 : 780;
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
                <text x={paddingLeft - 15} y={y + 5} textAnchor="end" className="text-[16px] fill-slate-400 font-bold">${step.toLocaleString()}</text>
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
                <text x={paddingLeft - 15} y={y + 5} textAnchor="end" className="text-[16px] fill-slate-400 font-bold">{step}</text>
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
                  y={height - paddingBottom + 30}
                  textAnchor="middle"
                  className={`text-[16.5px] font-medium tracking-tight transition-colors pointer-events-none ${isHovered ? 'fill-slate-900' : 'fill-slate-600'}`}
                >
                  {cat.label}
                </text>
              </g>
            );
          })}

          {isCombine && (
            <>
              <text x={paddingLeft - 80} y={paddingTop - 35} textAnchor="start" className="text-[15px] font-extrabold fill-slate-600 uppercase tracking-widest rotate-[-90] origin-left">Value ($)</text>
              <text x={paddingLeft - 65} y={height - paddingBottom + 15} textAnchor="start" className="text-[15px] font-extrabold fill-slate-600 uppercase tracking-widest rotate-[-90] origin-left">Qty (#)</text>
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

  const renderSpendingChart = () => {
    const width = 1050;
    const height = windowWidth < 640 ? 450 : 360;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const getPath = (data: number[], color: string, fillId: string) => {
      if (data.length === 0) return null;
      const points = data.map((val, i) => ({
        x: padding + (i / 30) * chartWidth,
        y: height - padding - (val / spendingAnalysisData.maxVal) * chartHeight
      }));

      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const cp1x = (points[i].x + points[i + 1].x) / 2;
        d += ` C ${cp1x} ${points[i].y}, ${cp1x} ${points[i + 1].y}, ${points[i + 1].x} ${points[i + 1].y}`;
      }

      const fillPath = `${d} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

      return (
        <g>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <path d={fillPath} fill={`url(#${fillId})`} />
          <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    };

    const hoveredX = chartHoveredDay !== null ? padding + (chartHoveredDay / 30) * chartWidth : null;

    return (
      <div className="relative">
        <svg
          ref={chartRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible cursor-default touch-none"
          onMouseMove={handleChartMouse}
          onMouseLeave={() => setChartHoveredDay(null)}
          onTouchStart={handleChartTouch}
          onTouchMove={handleChartTouch}
          onTouchEnd={() => setChartHoveredDay(null)}
        >
          {spendingAnalysisData.yAxisSteps.map((val, i) => {
            const y = height - padding - (val / spendingAnalysisData.maxVal) * chartHeight;
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                <text x={padding - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-bold">${Math.round(val)}</text>
              </g>
            );
          })}

          {(() => {
            const daysToDisplay = windowWidth < 640 ? [1, 5, 10, 15, 20, 25, 31] : Array.from({ length: 31 }, (_, i) => i + 1);
            return daysToDisplay.map(day => {
              const x = padding + ((day - 1) / 30) * chartWidth;
              return (
                <text
                  key={day}
                  x={x}
                  y={height - padding + 20}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-500 font-bold"
                >
                  {day}
                </text>
              );
            });
          })()}
          <text x="50%" y={height - 0} textAnchor="middle" className="text-[10px] fill-slate-400 font-black uppercase tracking-widest">Day of Month</text>

          {analysisMode === 'compare' && getPath(spendingAnalysisData.periodBStats.data, '#f97316', 'fillB')}
          {getPath(spendingAnalysisData.periodAStats.data, '#2563eb', 'fillA')}

          {chartHoveredDay !== null && hoveredX !== null && (
            <g className="pointer-events-none animate-in fade-in duration-150">
              <line x1={hoveredX} y1={padding} x2={hoveredX} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
              {chartHoveredDay < spendingAnalysisData.periodAStats.data.length && (
                <circle cx={hoveredX} cy={height - padding - (spendingAnalysisData.periodAStats.data[chartHoveredDay] / spendingAnalysisData.maxVal) * chartHeight} r="6" fill="#2563eb" stroke="white" strokeWidth="2.5" />
              )}
              {analysisMode === 'compare' && chartHoveredDay < spendingAnalysisData.periodBStats.data.length && (
                <circle cx={hoveredX} cy={height - padding - (spendingAnalysisData.periodBStats.data[chartHoveredDay] / spendingAnalysisData.maxVal) * chartHeight} r="6" fill="#f97316" stroke="white" strokeWidth="2.5" />
              )}
            </g>
          )}
        </svg>

        {chartHoveredDay !== null && (
          <div
            className="absolute pointer-events-none z-[100] animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: `${mousePos.x}px`,
              top: `${mousePos.y}px`,
              transform: `translate(${mousePos.x > mousePos.containerWidth / 2 ? 'calc(-100% - 15px)' : '15px'}, -50%)`,
              willChange: 'left, top'
            }}
          >
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-110 min-w-[200px]">
              <p className="text-sm font-black text-slate-400 mb-2">Day {chartHoveredDay + 1}</p>
              <div className="space-y-3">
                {chartHoveredDay < spendingAnalysisData.periodAStats.data.length && (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" />
                      <span className="text-xs font-bold text-slate-600">{formatPeriodName(periodA)}</span>
                    </div>
                    <span className="text-xs font-black text-slate-800">${Math.round(spendingAnalysisData.periodAStats.data[chartHoveredDay] || 0).toLocaleString()}</span>
                  </div>
                )}
                {analysisMode === 'compare' && chartHoveredDay < spendingAnalysisData.periodBStats.data.length && (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#f97316]" />
                      <span className="text-xs font-bold text-slate-600">{formatPeriodName(periodB)}</span>
                    </div>
                    <span className="text-xs font-black text-slate-800">${Math.round(spendingAnalysisData.periodBStats.data[chartHoveredDay] || 0).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-10 animate-in fade-in zoom-in-95 duration-300">
      <style>{`
        @keyframes slow-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-donut-spin {
          animation: slow-spin 40s linear infinite;
        }
        /* Stop spinning when hovering specifically on the animated group */
        .animate-donut-spin:hover {
          animation-play-state: paused !important;
        }
      `}</style>
      <div className="flex items-center gap-3 mb-0 px-4 sm:px-0 animate-in slide-in-from-left-4 duration-500">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h4 className="text-indigo-600 font-bold text-xl tracking-tight">Clinic Insights & Analysis</h4>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 sm:gap-10">
        <div className="bg-white rounded-none sm:rounded-[2.5rem] shadow-sm border-x-0 sm:border border-slate-100 p-4 sm:p-8 group transition-all">
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

            <div className="flex flex-wrap items-center gap-3 mb-16 sm:mb-24">
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

        {/* RIGHT: Clinic Distribution */}
        <div className="bg-white rounded-none sm:rounded-[2.5rem] border-x-0 sm:border border-slate-100 p-4 sm:p-8 shadow-sm flex flex-col gap-6 relative z-50">
          <div className="mb-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">Clinic Distribution</h3>
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

          <div className="flex flex-col items-center py-2 border-b border-slate-50 w-full">
            <div
              className="relative w-full flex justify-center"
              ref={containerRef}
              onMouseMove={handleDistributionMouseMove}
              onMouseEnter={() => setIsMouseOverSVG(true)}
              onMouseLeave={() => setIsMouseOverSVG(false)}
            >
              {(() => {
                const size = 250;
                const center = size / 2;
                return (
                  <svg width={size} height={260} viewBox={`0 0 ${size} 260`} className="overflow-visible">
                    <g
                      className="animate-donut-spin"
                      style={{
                        transformOrigin: `${center}px ${center}px`,
                        animationPlayState: hoveredIdx !== null ? 'paused' : 'running'
                      }}
                    >
                      {(() => {
                        const radius = 70;
                        const strokeWidth = 28;
                        let cumulativeAngle = -Math.PI / 2;
                        const defaultColors = ['#2563eb', '#facc15', '#f97316', '#db2777', '#9333ea', '#dc2626', '#10b981'];

                        return currentBreakdown.map((cat, idx) => {
                          if (cat.amount === 0) return null;
                          const angle = (cat.amount / totalValue) * 2 * Math.PI;
                          const x1 = center + radius * Math.cos(cumulativeAngle);
                          const y1 = center + radius * Math.sin(cumulativeAngle);
                          cumulativeAngle += angle;
                          const x2 = center + radius * Math.cos(cumulativeAngle);
                          const y2 = center + radius * Math.sin(cumulativeAngle);

                          const largeArcFlag = angle > Math.PI ? 1 : 0;
                          const isFullCircle = angle >= (2 * Math.PI - 0.001);
                          const pathData = isFullCircle ? "" : `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
                          const isHovered = hoveredIdx === idx;

                          const color = breakdownType === 'category'
                            ? getCategoryColor(cat.id)
                            : defaultColors[idx % defaultColors.length];

                          return (
                            <g key={cat.id} className="group">
                              {isFullCircle ? (
                                <circle cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
                                  className="transition-all duration-300 cursor-pointer origin-center"
                                  style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)', opacity: (hoveredIdx !== null && !isHovered) ? 0.3 : 1 }}
                                  onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} />
                              ) : (
                                <path d={pathData} fill="none" stroke={color} strokeWidth={strokeWidth}
                                  className="transition-all duration-300 cursor-pointer origin-center"
                                  style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)', opacity: (hoveredIdx !== null && !isHovered) ? 0.3 : 1 }}
                                  onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} />
                              )}
                            </g>
                          );
                        });
                      })()}
                    </g>
                    <g className="pointer-events-none">
                      <text x={center} y={center - 5} textAnchor="middle" className="text-[9px] font-black text-slate-400 fill-slate-400 uppercase tracking-widest">
                        {hoveredIdx !== null ? currentBreakdown[hoveredIdx].label : 'Total'}
                      </text>
                      <text x={center} y={center + 15} textAnchor="middle" className="text-lg font-black fill-slate-800">
                        {hoveredIdx !== null
                          ? (isReorderReport
                            ? currentBreakdown[hoveredIdx].amount.toLocaleString()
                            : (isQuantityReport
                              ? currentBreakdown[hoveredIdx].amount.toLocaleString()
                              : `$${(currentBreakdown[hoveredIdx].totalSpent ?? currentBreakdown[hoveredIdx].amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`))
                          : (isReorderReport
                            ? usageStats.totalReorders.toLocaleString()
                            : (isQuantityReport
                              ? usageStats.totalQuantity.toLocaleString()
                              : `$${usageStats.totalExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`))}
                      </text>
                    </g>
                  </svg>
                );
              })()}

              {hoveredIdx !== null && isMouseOverSVG && currentBreakdown[hoveredIdx].amount > 0 && (
                <div
                  className="absolute top-0 left-0 z-[500] pointer-events-none will-change-transform transition-all duration-300 ease-out"
                  style={{
                    transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0) translate(${mousePos.x < 70 ? '0%' : (mousePos.x > mousePos.containerWidth - 70 ? '-100%' : '-50%')}, -115%)`
                  }}
                >
                  <div className="bg-white border border-slate-111 rounded-[1.25rem] p-4 flex flex-col items-center text-center min-w-[130px] shadow-sm">
                    <span className="text-[10px] font-bold text-slate-500 leading-none mb-1.5 tracking-wide">{currentBreakdown[hoveredIdx].label}</span>
                    <span className="text-sm font-black text-slate-800 leading-none mb-1.5">
                      {isReorderReport ? `${currentBreakdown[hoveredIdx].amount.toLocaleString()} Reorders` : (isQuantityReport ? `${currentBreakdown[hoveredIdx].amount.toLocaleString()} Units` : `$${currentBreakdown[hoveredIdx].amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100/50">
                      {currentBreakdown[hoveredIdx].percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 w-full max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {currentBreakdown.map((cat, idx) => {
              const defaultColors = ['#2563eb', '#facc15', '#f97316', '#db2777', '#9333ea', '#dc2626', '#10b981'];
              const color = breakdownType === 'category'
                ? getCategoryColor(cat.id)
                : defaultColors[idx % defaultColors.length];

              return (
                <div
                  key={cat.id}
                  className="flex flex-col gap-2.5 transition-opacity cursor-pointer group w-full"
                  style={{ opacity: (hoveredIdx !== null && hoveredIdx !== idx) ? 0.5 : 1 }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <div className="flex items-center justify-between gap-4 w-full">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:border-emerald-100 transition-colors shrink-0">
                        {cat.icon || <Package className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[12px] font-black text-slate-800 leading-none mb-1 tracking-wide truncate group-hover:text-emerald-700">{cat.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500 leading-tight">
                            {cat.percentage.toFixed(1)}% share
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-slate-800">
                        {isReorderReport ? cat.amount : (isQuantityReport ? cat.amount.toLocaleString() : `$${cat.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${cat.percentage}%`,
                        backgroundColor: color,
                        boxShadow: (hoveredIdx === idx) ? `0 0 12px ${color}80` : `0 0 8px ${color}40`
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:col-span-2">

          {/* LEFT: Spending Analysis */}
          <div className="bg-white rounded-none sm:rounded-[2.5rem] border-x-0 sm:border border-slate-100 p-4 sm:p-8 shadow-sm flex flex-col gap-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">Spending Analysis</h3>
              </div>
              <div className="bg-slate-50 p-1 rounded-xl border border-slate-100 flex gap-1 self-start sm:self-auto">
                <button
                  onClick={() => setAnalysisMode('single')}
                  className={`px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all ${analysisMode === 'single' ? 'bg-white text-[#2563eb] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Single Period
                </button>
                <button
                  onClick={() => setAnalysisMode('compare')}
                  className={`px-3 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-bold transition-all ${analysisMode === 'compare' ? 'bg-white text-[#f97316] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Compare Months
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6 bg-slate-50/50 p-4 md:p-6 rounded-3xl border border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 tracking-wider">Period A (Primary)</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="month"
                      value={periodA}
                      onChange={(e) => setPeriodA(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
                    />
                  </div>
                </div>
                {analysisMode === 'compare' ? (
                  <div className="flex flex-col gap-1.5 animate-in slide-in-from-right-2 duration-300">
                    <label className="text-[10px] font-bold text-slate-500 tracking-wider">Period B (Compare To)</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="month"
                        value={periodB}
                        onChange={(e) => setPeriodB(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[13px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
                      />
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

                  <div className="relative" ref={categoryDropdownRef}>
                    <button
                      onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#2563eb] transition-all group"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1.5 bg-blue-50 text-[#2563eb] rounded-lg shrink-0">
                          {currentCategoryOption.icon}
                        </div>
                        <span className="text-[13px] font-bold text-slate-700 truncate">{currentCategoryOption.label}</span>
                      </div>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isCategoryDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-1.5 space-y-0.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                          {categoryOptions.map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => {
                                setSelectedCategory(opt.id);
                                setIsCategoryDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all group ${selectedCategory === opt.id ? 'bg-blue-50 text-[#2563eb]' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className={`p-1 rounded-md transition-colors ${selectedCategory === opt.id ? 'bg-white text-[#2563eb] shadow-sm' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[#2563eb]'}`}>
                                  {opt.icon}
                                </div>
                                <span className="text-[10px] font-bold truncate">{opt.label}</span>
                              </div>
                              {selectedCategory === opt.id && <Check className="w-3 h-3" />}
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

                  <div className="relative" ref={vendorDropdownRef}>
                    <button
                      onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#2563eb] transition-all group"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1.5 bg-blue-50 text-[#2563eb] rounded-lg shrink-0">
                          {currentVendorOption.icon}
                        </div>
                        <span className="text-[13px] font-bold text-slate-700 truncate">{currentVendorOption.label}</span>
                      </div>
                      <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isVendorDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isVendorDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-1.5 space-y-0.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                          {vendorOptions.map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => {
                                setSelectedVendor(opt.id);
                                setIsVendorDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all group ${selectedVendor === opt.id ? 'bg-blue-50 text-[#2563eb]' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className={`p-1 rounded-md transition-colors ${selectedVendor === opt.id ? 'bg-white text-[#2563eb] shadow-sm' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[#2563eb]'}`}>
                                  {opt.icon}
                                </div>
                                <span className="text-[10px] font-bold truncate">{opt.label}</span>
                              </div>
                              {selectedVendor === opt.id && <Check className="w-3 h-3" />}
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
              <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-6 animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-center sm:justify-start gap-8 sm:gap-12 w-full sm:w-auto">
                  <div className="text-center sm:text-left">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{formatPeriodName(periodA)}</p>
                    <p className="text-xl sm:text-2xl font-black text-slate-800">${Math.round(spendingAnalysisData.periodAStats.total).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <TrendingUp className="w-5 h-5 text-slate-300" />
                  </div>
                  <div className="text-center sm:text-left">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{formatPeriodName(periodB)}</p>
                    <p className="text-xl sm:text-2xl font-black text-slate-400">${Math.round(spendingAnalysisData.periodBStats.total).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-center sm:text-right w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-200/50">
                  <div className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-100 text-xs font-black mb-1">
                    <ArrowUpRight className="w-3 h-3" /> {spendingAnalysisData.growth.toFixed(1)}%
                  </div>
                  <p className="text-[10px] font-medium text-slate-400">Spending is {spendingAnalysisData.multiplier}x compared to period B</p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                  {selectedCategory === 'all' && selectedVendor === 'all'
                    ? 'All Inventory Spending'
                    : 'Filtered Financial Trend'}
                </p>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#2563eb]" />
                    <span className="text-[10px] font-bold text-slate-500">{formatPeriodName(periodA)}</span>
                  </div>
                  {analysisMode === 'compare' && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#f97316]" />
                      <span className="text-[10px] font-bold text-slate-500">{formatPeriodName(periodB)}</span>
                    </div>
                  )}
                </div>
              </div>
              {renderSpendingChart()}
            </div>
          </div>



        </div>
      </div>
    </div>
  );
};

export default ClinicAnalytics;
