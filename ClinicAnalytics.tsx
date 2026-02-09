
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
  Clock
} from 'lucide-react';
import { PurchaseHistory } from './types';
import { CATEGORIES } from './constants';

interface ClinicAnalyticsProps {
  history: PurchaseHistory[];
}

const ClinicAnalytics: React.FC<ClinicAnalyticsProps> = ({ history }) => {
  const [breakdownType, setBreakdownType] = useState<'category' | 'vendor' | 'product' | 'reorder'>('category');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [isMouseOverSVG, setIsMouseOverSVG] = useState(false);
  const [chartHoveredDay, setChartHoveredDay] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const [isBreakdownDropdownOpen, setIsBreakdownDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  
  const breakdownDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  // Spending Analysis States
  const [analysisMode, setAnalysisMode] = useState<'single' | 'compare'>('single');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  
  // Clinic Distribution Period State
  const [distributionPeriod, setDistributionPeriod] = useState<string>('all');

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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizeKey = (value: string | null | undefined, fallback: string) => {
    const key = (value || '').trim().toLowerCase();
    return key || fallback.toLowerCase();
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

    const maxVal = Math.max(...periodAStats.data, ...periodBStats.data, 100);
    const yAxisSteps = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];

    const growth = periodBStats.total > 0 
      ? ((periodAStats.total - periodBStats.total) / periodBStats.total) * 100 
      : 0;
    
    const multiplier = periodBStats.total > 0 ? (periodAStats.total / periodBStats.total).toFixed(1) : '0';

    return { periodAStats, periodBStats, maxVal, yAxisSteps, growth, multiplier };
  }, [history, periodA, periodB, selectedCategory, selectedVendor, topVendorsForFilter]);

  const currentBreakdown = useMemo(() => {
    switch(breakdownType) {
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
      y: e.clientY - rect.top
    });
  };

  const handleChartMouseMove = (e: React.MouseEvent) => {
    const svg = chartRef.current;
    if (!svg) return;

    // Standard width/height of the SVG space
    const width = 600;
    const padding = 40;
    const chartWidth = width - padding * 2;

    // High-precision SVG coordinate transformation
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    
    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return;
    
    const svgP = pt.matrixTransform(screenCTM.inverse());
    
    // Calculate which day we are over based on SVG internal units
    const chartX = svgP.x - padding;
    const dayIdx = Math.round((chartX / chartWidth) * 30);
    const dayClamped = Math.max(0, Math.min(30, dayIdx));
    
    setChartHoveredDay(dayClamped);
    
    // Tooltip position relative to the wrapper div
    const parentRect = svg.parentElement?.getBoundingClientRect();
    if (parentRect) {
      setMousePos({
        x: e.clientX - parentRect.left,
        y: e.clientY - parentRect.top
      });
    }
  };

  const renderSpendingChart = () => {
    const width = 600;
    const height = 300;
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

      const fillPath = `${d} L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

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
          width="100%" 
          height={height} 
          viewBox={`0 0 ${width} ${height}`} 
          preserveAspectRatio="xMidYMid meet"
          className="overflow-visible cursor-default touch-none"
          onMouseMove={handleChartMouseMove}
          onMouseLeave={() => setChartHoveredDay(null)}
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

          {[1, 5, 10, 15, 20, 25, 31].map(day => {
            const x = padding + ((day - 1) / 30) * chartWidth;
            return <text key={day} x={x} y={height - padding + 20} textAnchor="middle" className="text-[10px] fill-slate-400 font-bold">{day}</text>;
          })}
          <text x="50%" y={height - 5} textAnchor="middle" className="text-[10px] fill-slate-400 font-black uppercase tracking-widest">Day of Month</text>

          {analysisMode === 'compare' && getPath(spendingAnalysisData.periodBStats.data, '#8b5cf6', 'fillB')}
          {getPath(spendingAnalysisData.periodAStats.data, '#06b6d4', 'fillA')}

          {chartHoveredDay !== null && hoveredX !== null && (
            <g className="pointer-events-none animate-in fade-in duration-150">
              <line x1={hoveredX} y1={padding} x2={hoveredX} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
              <circle cx={hoveredX} cy={height - padding - (spendingAnalysisData.periodAStats.data[chartHoveredDay] / spendingAnalysisData.maxVal) * chartHeight} r="6" fill="#06b6d4" stroke="white" strokeWidth="2.5" />
              {analysisMode === 'compare' && (
                <circle cx={hoveredX} cy={height - padding - (spendingAnalysisData.periodBStats.data[chartHoveredDay] / spendingAnalysisData.maxVal) * chartHeight} r="6" fill="#8b5cf6" stroke="white" strokeWidth="2.5" />
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
              transform: 'translate(15px, -50%)',
              willChange: 'left, top'
            }}
          >
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-110 min-w-[200px]">
              <p className="text-sm font-black text-slate-400 mb-2">Day {chartHoveredDay + 1}</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]" />
                    <span className="text-xs font-bold text-slate-600">{formatPeriodName(periodA)}</span>
                  </div>
                  <span className="text-xs font-black text-slate-800">${Math.round(spendingAnalysisData.periodAStats.data[chartHoveredDay] || 0).toLocaleString()}</span>
                </div>
                {analysisMode === 'compare' && (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
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
          animation: slow-spin 35s linear infinite;
        }
        /* Stop spinning when hovering specifically on the animated group */
        .animate-donut-spin:hover {
          animation-play-state: paused !important;
        }
      `}</style>
      <div className="flex items-center gap-3 mb-4 animate-in slide-in-from-left-4 duration-500">
        <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h4 className="text-indigo-600 font-bold text-xl tracking-tight">Clinic Insights & Analysis</h4>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        
        {/* LEFT: Spending Analysis */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-800">Spending Analysis</h3>
              <p className="text-xs text-slate-400 font-medium">Detailed financial trend and period comparison</p>
            </div>
            <div className="bg-slate-50 p-1 rounded-xl border border-slate-100 flex gap-1">
              <button 
                onClick={() => setAnalysisMode('single')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${analysisMode === 'single' ? 'bg-white text-[#06b6d4] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Single Period
              </button>
              <button 
                onClick={() => setAnalysisMode('compare')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${analysisMode === 'compare' ? 'bg-white text-[#8b5cf6] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Compare Months
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 tracking-wider">Period A (Primary)</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="month" 
                    value={periodA} 
                    onChange={(e) => setPeriodA(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-500 outline-none focus:ring-2 focus:ring-[#06b6d4]/20 transition-all"
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
                      className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-500 outline-none focus:ring-2 focus:ring-[#06b6d4]/20 transition-all"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-0">Spacer</label>
                  <div className="h-[46px] flex items-center justify-center text-slate-300 text-[10px] font-bold uppercase tracking-widest bg-white/50 border border-dashed border-slate-200 rounded-xl">
                    Comparative Mode Off
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3 h-3" /> Category Filter
                </label>
                
                <div className="relative" ref={categoryDropdownRef}>
                  <button 
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#06b6d4] transition-all group"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="p-1.5 bg-cyan-50 text-[#06b6d4] rounded-lg shrink-0">
                        {currentCategoryOption.icon}
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 truncate">{currentCategoryOption.label}</span>
                    </div>
                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isCategoryDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-1.5 space-y-0.5">
                        {categoryOptions.map((opt) => (
                          <button 
                            key={opt.id}
                            onClick={() => {
                              setSelectedCategory(opt.id);
                              setIsCategoryDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all group ${selectedCategory === opt.id ? 'bg-cyan-50 text-[#06b6d4]' : 'hover:bg-slate-50 text-slate-600'}`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className={`p-1 rounded-md transition-colors ${selectedCategory === opt.id ? 'bg-white text-[#06b6d4] shadow-sm' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[#06b6d4]'}`}>
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
                  <Building2 className="w-3 h-3" /> Vendor Filter
                </label>
                
                <div className="relative" ref={vendorDropdownRef}>
                  <button 
                    onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-[#06b6d4] transition-all group"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="p-1.5 bg-cyan-50 text-[#06b6d4] rounded-lg shrink-0">
                        {currentVendorOption.icon}
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 truncate">{currentVendorOption.label}</span>
                    </div>
                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isVendorDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isVendorDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-1.5 space-y-0.5">
                        {vendorOptions.map((opt) => (
                          <button 
                            key={opt.id}
                            onClick={() => {
                              setSelectedVendor(opt.id);
                              setIsVendorDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all group ${selectedVendor === opt.id ? 'bg-cyan-50 text-[#06b6d4]' : 'hover:bg-slate-50 text-slate-600'}`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className={`p-1 rounded-md transition-colors ${selectedVendor === opt.id ? 'bg-white text-[#06b6d4] shadow-sm' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-[#06b6d4]'}`}>
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
            <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 flex items-center justify-between animate-in zoom-in-95 duration-300">
               <div className="flex items-center gap-12">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{formatPeriodName(periodA)}</p>
                    <p className="text-2xl font-black text-slate-800">${Math.round(spendingAnalysisData.periodAStats.total).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <TrendingUp className="w-5 h-5 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{formatPeriodName(periodB)}</p>
                    <p className="text-2xl font-black text-slate-400">${Math.round(spendingAnalysisData.periodBStats.total).toLocaleString()}</p>
                  </div>
               </div>
               <div className="text-right">
                  <div className="inline-flex items-center gap-1 px-3 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-100 text-xs font-black mb-1">
                    <ArrowUpRight className="w-3 h-3" /> {spendingAnalysisData.growth.toFixed(1)}%
                  </div>
                  <p className="text-[10px] font-medium text-slate-400">Spending is {spendingAnalysisData.multiplier}x compared to period B</p>
               </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                {selectedCategory === 'all' && selectedVendor === 'all' 
                  ? 'All Inventory Spending' 
                  : 'Filtered Financial Trend'}
              </p>
              <div className="flex justify-end gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#06b6d4]" />
                  <span className="text-[10px] font-bold text-slate-500">{formatPeriodName(periodA)}</span>
                </div>
                {analysisMode === 'compare' && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#8b5cf6]" />
                    <span className="text-[10px] font-bold text-slate-500">{formatPeriodName(periodB)}</span>
                  </div>
                )}
              </div>
            </div>
            {renderSpendingChart()}
          </div>
        </div>

        {/* RIGHT: Clinic Distribution */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm flex flex-col gap-6 relative z-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-800">Clinic Distribution</h3>
              <p className="text-xs text-slate-400 font-medium">Inventory segmentation overview</p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Period Dropdown */}
              <div className="relative" ref={periodDropdownRef}>
                <button 
                  onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl shadow-sm hover:border-emerald-600 transition-all group min-w-[120px]"
                >
                  <div className="p-1.5 bg-white text-emerald-600 rounded-lg shadow-sm">
                    <Clock className="w-3 h-3" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[9px] font-bold text-slate-500 leading-normal mb-0.5 tracking-normal">Timeframe</p>
                    <p className="text-[10px] font-bold text-slate-700 leading-none">{formatPeriodName(distributionPeriod)}</p>
                  </div>
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isPeriodDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isPeriodDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-md border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-1.5 space-y-0.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                      <button 
                        onClick={() => { setDistributionPeriod('all'); setIsPeriodDropdownOpen(false); }}
                        className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all ${distributionPeriod === 'all' ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-slate-50 text-slate-600'}`}
                      >
                        <span className="text-[10px] font-bold">All Time</span>
                        {distributionPeriod === 'all' && <Check className="w-3 h-3" />}
                      </button>
                      {availableMonths.map(month => (
                        <button 
                          key={month}
                          onClick={() => { setDistributionPeriod(month); setIsPeriodDropdownOpen(false); }}
                          className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-all ${distributionPeriod === month ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-slate-50 text-slate-600'}`}
                        >
                          <span className="text-[10px] font-bold">{formatPeriodName(month)}</span>
                          {distributionPeriod === month && <Check className="w-3 h-3" />}
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
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl shadow-sm hover:border-emerald-600 transition-all group min-w-[140px]"
                >
                  <div className="p-1.5 bg-white text-emerald-600 rounded-lg shadow-sm">
                    {currentBreakdownOption.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[9px] font-bold text-slate-500 leading-normal mb-0.5 tracking-normal">View Mode</p>
                    <p className="text-[10px] font-bold text-slate-700 leading-none">{currentBreakdownOption.label}</p>
                  </div>
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isBreakdownDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isBreakdownDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-52 bg-white rounded-xl shadow-md border border-slate-100 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-1.5 space-y-0.5">
                      {breakdownOptions.map((opt) => (
                        <button 
                          key={opt.value}
                          onClick={() => {
                            setBreakdownType(opt.value as any);
                            setIsBreakdownDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all group ${breakdownType === opt.value ? 'bg-emerald-50 text-emerald-600' : 'hover:bg-slate-50 text-slate-600'}`}
                        >
                          <div className={`p-1 rounded-md transition-colors ${breakdownType === opt.value ? 'bg-white text-emerald-600 shadow-sm' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-emerald-600'}`}>
                            {opt.icon}
                          </div>
                          <span className="text-[10px] font-black">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-center py-4 border-b border-slate-50">
            <div 
              className="relative" 
              ref={containerRef} 
              onMouseMove={handleDistributionMouseMove}
              onMouseEnter={() => setIsMouseOverSVG(true)}
              onMouseLeave={() => setIsMouseOverSVG(false)}
            >
              {(() => {
                const size = 250;
                const center = size / 2;
                return (
                  <svg width={size} height={260} viewBox={`0 0 ${size} 260`} className="mx-auto overflow-visible">
                    <g 
                      className="animate-donut-spin" 
                      style={{ 
                        transformOrigin: `${center}px ${center}px`,
                        animationPlayState: isMouseOverSVG ? 'paused' : 'running'
                      }}
                    >
                      {(() => {
                        const radius = 70;
                        const strokeWidth = 28;
                        let cumulativeAngle = -Math.PI / 2;
                        const colors = ['#2563eb', '#facc15', '#f97316', '#3b82f6', '#9333ea', '#dc2626', '#10b981'];

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

                          return (
                            <g key={cat.id} className="group">
                              {isFullCircle ? (
                                <circle cx={center} cy={center} r={radius} fill="none" stroke={colors[idx % colors.length]} strokeWidth={strokeWidth} 
                                  className="transition-all duration-300 cursor-pointer origin-center"
                                  style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)', opacity: (hoveredIdx !== null && !isHovered) ? 0.3 : 1 }}
                                  onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} />
                              ) : (
                                <path d={pathData} fill="none" stroke={colors[idx % colors.length]} strokeWidth={strokeWidth}
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
                  className="absolute top-0 left-0 z-[100] pointer-events-none will-change-transform transition-all duration-300 ease-out"
                  style={{ 
                    transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0) translate(-50%, -115%)`
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {currentBreakdown.map((cat, idx) => {
              const colors = ['#2563eb', '#facc15', '#f97316', '#3b82f6', '#9333ea', '#dc2626', '#10b981'];
              const color = colors[idx % colors.length];
              
              return (
                <div 
                  key={cat.id} 
                  className="flex flex-col gap-2.5 transition-opacity cursor-pointer group"
                  style={{ opacity: (hoveredIdx !== null && hoveredIdx !== idx) ? 0.5 : 1 }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:border-emerald-100 transition-colors shrink-0">
                        {cat.icon || <Package className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[12px] font-black text-slate-800 leading-none mb-1 tracking-wide truncate group-hover:text-emerald-700">{cat.label}</span>
                        <span className="text-[10px] font-bold text-slate-500 leading-thigh">
                          {cat.percentage.toFixed(1)}%
                        </span>
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

      </div>
    </div>
  );
};

export default ClinicAnalytics;
