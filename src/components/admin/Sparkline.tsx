'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
  showDots?: boolean;
  showAxis?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'currentColor',
  fillColor,
  showDots = false,
  showAxis = false,
  className,
  ariaLabel,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <div className={cn('flex items-center justify-center text-on-surface-variant/40', className)}>
        <span className="font-mono text-[9px]">No data</span>
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  // Generate path
  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * innerWidth;
    const y = padding + innerHeight - ((value - min) / range) * innerHeight;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fillD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  const lastPoint = points[points.length - 1];
  const trend = data[data.length - 1] >= data[0] ? 'up' : 'down';

  return (
    <div className={cn('relative inline-flex items-center', className)} role="img" aria-label={ariaLabel || 'Trend chart'}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {/* Fill area */}
        {fillColor && <path d={fillD} fill={fillColor} opacity={0.2} />}

        {/* Main line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* End dot */}
        <circle cx={lastPoint.x} cy={lastPoint.y} r={2.5} fill={color} stroke="white" strokeWidth={1} />

        {/* Optional data points */}
        {showDots && points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={color} opacity={0.6} />)}

        {/* Optional axis */}
        {showAxis && (
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="currentColor"
            strokeWidth={0.5}
            opacity={0.2}
          />
        )}
      </svg>
    </div>
  );
}

interface TrendIndicatorProps {
  current: number;
  previous: number;
  format?: (v: number) => string;
  className?: string;
}

export function TrendIndicator({ current, previous, format, className }: TrendIndicatorProps) {
  const diff = current - previous;
  const pctChange = previous !== 0 ? Math.round((diff / previous) * 100) : 0;
  const isUp = diff > 0;
  const isDown = diff < 0;
  const fmt = format || ((v: number) => v.toLocaleString());

  return (
    <span className={cn('inline-flex items-center gap-1 font-mono text-[9px] font-bold', className)}>
      {isUp && (
        <span className="inline-flex items-center gap-0.5 text-emerald-600">
          <TrendingUp className="w-3 h-3" /> {fmt(Math.abs(diff))} ({Math.abs(pctChange)}%)
        </span>
      )}
      {isDown && (
        <span className="inline-flex items-center gap-0.5 text-red-600">
          <TrendingDown className="w-3 h-3" /> {fmt(Math.abs(diff))} ({Math.abs(pctChange)}%)
        </span>
      )}
      {!isUp && !isDown && (
        <span className="inline-flex items-center gap-0.5 text-on-surface-variant/40">
          <Minus className="w-3 h-3" /> No change
        </span>
      )}
    </span>
  );
}
