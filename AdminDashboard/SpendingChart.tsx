
import React from 'react';

interface SpendingChartProps {
  data: {
    periodAStats: { data: number[] };
    periodBStats: { data: number[] };
    maxVal: number;
    yAxisSteps: number[];
  };
  analysisMode: 'single' | 'compare';
  hoveredDay: number | null;
  onHoverDay: (day: number | null, pos?: { x: number, y: number }) => void;
  mousePos: { x: number, y: number };
  periodAName: string;
  periodBName: string;
  chartRef: React.RefObject<SVGSVGElement | null>;
  selectedCategory?: string;
  selectedVendor?: string;
  windowWidth?: number;
}

const SpendingChart: React.FC<SpendingChartProps> = ({
  data,
  analysisMode,
  hoveredDay,
  onHoverDay,
  mousePos,
  periodAName,
  periodBName,
  chartRef,
  selectedCategory = 'all',
  selectedVendor = 'all',
  windowWidth = 1000
}) => {
  const width = 1000;
  const height = 360;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  const tooltipStyle = React.useMemo(() => {
    const tooltipWidth = tooltipRef.current?.offsetWidth ?? 220;
    const wrapperWidth = wrapperRef.current?.offsetWidth ?? 0;
    const paddingOffset = 16;
    const willOverflowRight = wrapperWidth > 0 && (mousePos.x + tooltipWidth + paddingOffset > wrapperWidth);
    const translateX = willOverflowRight ? `calc(-100% - ${paddingOffset}px)` : `${paddingOffset}px`;
    const clampedLeft = wrapperWidth
      ? Math.min(Math.max(mousePos.x, paddingOffset), wrapperWidth - paddingOffset)
      : mousePos.x;

    return {
      left: `${clampedLeft}px`,
      top: `${mousePos.y}px`,
      transform: `translate(${translateX}, -50%)`,
      willChange: 'left, top'
    };
  }, [mousePos.x, mousePos.y, hoveredDay]);

  const getPath = (dataArr: number[], color: string, fillId: string) => {
    if (!dataArr || dataArr.length === 0) return null;
    const points = dataArr.map((val, i) => ({
      x: padding + (i / 30) * chartWidth,
      y: height - padding - (val / data.maxVal) * chartHeight
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

  const hoveredX = hoveredDay !== null ? padding + (hoveredDay / 30) * chartWidth : null;

  return (
    <div className="relative w-full overflow-visible" ref={wrapperRef}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
          {selectedCategory === 'all' && selectedVendor === 'all'
            ? 'All Inventory Spending'
            : 'Filtered Financial Trend'}
        </p>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2563eb]" />
            <span className="text-[10px] font-bold text-slate-500">{periodAName}</span>
          </div>
          {analysisMode === 'compare' && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#f97316]" />
              <span className="text-[10px] font-bold text-slate-500">{periodBName}</span>
            </div>
          )}
        </div>
      </div>
      <svg
        ref={chartRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible cursor-default touch-none"
        onMouseMove={(e) => {
          const svg = chartRef.current;
          if (!svg) return;

          // High-precision SVG coordinate transformation
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;

          const screenCTM = svg.getScreenCTM();
          if (!screenCTM) return;

          const svgP = pt.matrixTransform(screenCTM.inverse());

          // Ignore moves outside the plot area to prevent stray tooltips
          if (
            svgP.x < padding ||
            svgP.x > width - padding ||
            svgP.y < padding ||
            svgP.y > height - padding
          ) {
            onHoverDay(null);
            return;
          }
          // Calculate which day we are over based on SVG internal units
          const chartX = svgP.x - padding;
          const dayIdx = Math.round((chartX / chartWidth) * 30);
          const dayClamped = Math.max(0, Math.min(30, dayIdx));

          // Tooltip position relative to the wrapper div
          const rect = svg.parentElement?.getBoundingClientRect();
          const mX = rect ? e.clientX - rect.left : 0;
          const mY = rect ? e.clientY - rect.top : 0;

          onHoverDay(dayClamped, { x: mX, y: mY });
        }}
        onMouseLeave={() => onHoverDay(null)}
      >
        {data.yAxisSteps.map((val, i) => {
          const y = height - padding - (val / data.maxVal) * chartHeight;
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

        {analysisMode === 'compare' && getPath(data.periodBStats.data, '#f97316', 'fillSpB')}
        {getPath(data.periodAStats.data, '#2563eb', 'fillSpA')}

        {hoveredDay !== null && hoveredX !== null && (
          <g className="pointer-events-none animate-in fade-in duration-150">
            <line x1={hoveredX} y1={padding} x2={hoveredX} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
            {hoveredDay < data.periodAStats.data.length && (
              <circle cx={hoveredX} cy={height - padding - (data.periodAStats.data[hoveredDay] / data.maxVal) * chartHeight} r="6" fill="#2563eb" stroke="white" strokeWidth="2.5" />
            )}
            {analysisMode === 'compare' && hoveredDay < data.periodBStats.data.length && (
              <circle cx={hoveredX} cy={height - padding - (data.periodBStats.data[hoveredDay] / data.maxVal) * chartHeight} r="6" fill="#f97316" stroke="white" strokeWidth="2.5" />
            )}
          </g>
        )}
      </svg>

      {hoveredDay !== null && (
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none z-[100] animate-in fade-in zoom-in-95 duration-200"
          style={tooltipStyle}
        >
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 min-w-[200px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Day {hoveredDay + 1}</p>
            <div className="space-y-3">
              {hoveredDay < data.periodAStats.data.length && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" />
                    <span className="text-xs font-bold text-slate-600">{periodAName}</span>
                  </div>
                  <span className="text-xs font-black text-slate-800">${Math.round(data.periodAStats.data[hoveredDay] || 0).toLocaleString()}</span>
                </div>
              )}
              {analysisMode === 'compare' && hoveredDay < data.periodBStats.data.length && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#f97316]" />
                    <span className="text-xs font-bold text-slate-600">{periodBName}</span>
                  </div>
                  <span className="text-xs font-black text-slate-800">${Math.round(data.periodBStats.data[hoveredDay] || 0).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpendingChart;
