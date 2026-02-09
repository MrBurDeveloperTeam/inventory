
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
}

const SpendingChart: React.FC<SpendingChartProps> = ({
  data,
  analysisMode,
  hoveredDay,
  onHoverDay,
  mousePos,
  periodAName,
  periodBName,
  chartRef
}) => {
  const width = 1000;
  const height = 300;
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

  const hoveredX = hoveredDay !== null ? padding + (hoveredDay / 30) * chartWidth : null;

  return (
    <div className="relative w-full overflow-visible" ref={wrapperRef}>
      <svg 
        ref={chartRef}
        width="100%" 
        height={height} 
        viewBox={`0 0 ${width} ${height}`} 
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible cursor-default touch-none"
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

        {[1, 5, 10, 15, 20, 25, 31].map(day => {
          const x = padding + ((day - 1) / 30) * chartWidth;
          return <text key={day} x={x} y={height - padding + 20} textAnchor="middle" className="text-[10px] fill-slate-400 font-bold">{day}</text>;
        })}

        {analysisMode === 'compare' && getPath(data.periodBStats.data, '#8b5cf6', 'fillSpB')}
        {getPath(data.periodAStats.data, '#06b6d4', 'fillSpA')}

        {hoveredDay !== null && hoveredX !== null && (
          <g className="pointer-events-none animate-in fade-in duration-150">
            <line x1={hoveredX} y1={padding} x2={hoveredX} y2={height - padding} stroke="#cbd5e1" strokeWidth="1" />
            <circle cx={hoveredX} cy={height - padding - (data.periodAStats.data[hoveredDay] / data.maxVal) * chartHeight} r="6" fill="#06b6d4" stroke="white" strokeWidth="2.5" />
            {analysisMode === 'compare' && (
              <circle cx={hoveredX} cy={height - padding - (data.periodBStats.data[hoveredDay] / data.maxVal) * chartHeight} r="6" fill="#8b5cf6" stroke="white" strokeWidth="2.5" />
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
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]" />
                  <span className="text-xs font-bold text-slate-600">{periodAName}</span>
                </div>
                <span className="text-xs font-black text-slate-800">${Math.round(data.periodAStats.data[hoveredDay] || 0).toLocaleString()}</span>
              </div>
              {analysisMode === 'compare' && (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
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
