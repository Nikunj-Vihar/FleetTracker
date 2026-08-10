"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { formatDateShort } from "@/lib/utils";
import type { TrendPoint } from "@/lib/validation";

// Colors follow the dataviz skill's reference palette (references/palette.md):
// line = categorical slot 1 (blue), band = same hue at ~10% wash, worse-flag =
// status critical red, better-flag = categorical slot 7 (violet) so it never
// collides with the blue trend line itself. Both flag types also carry an
// icon + label in the legend/tooltip, never color alone.
const COLOR_LINE = "#2a78d6";
const COLOR_BAND = "rgba(42, 120, 214, 0.10)";
const COLOR_WORSE = "#d03b3b";
const COLOR_BETTER = "#4a3aa7";
const COLOR_AXIS = "#898781";
const COLOR_GRID = "#e1e0d9";

interface ChartDatum {
  date: string;
  average: number;
  lowerBound: number | null;
  bandHeight: number | null;
  isAnomalous: boolean;
  direction: TrendPoint["direction"];
  label: string;
  baseline: number | null;
}

function CustomDot(props: { cx?: number; cy?: number; payload?: ChartDatum }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  if (!payload.isAnomalous) {
    return <circle cx={cx} cy={cy} r={3} fill={COLOR_LINE} stroke="var(--chart-surface, #fff)" strokeWidth={1.5} />;
  }
  const color = payload.direction === "WORSE" ? COLOR_WORSE : COLOR_BETTER;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={color} stroke="var(--chart-surface, #fff)" strokeWidth={2} />
    </g>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="font-medium text-slate-700 dark:text-slate-200">{d.label}</p>
      <p className="text-slate-500 dark:text-slate-400">{formatDateShort(d.date)}</p>
      <p className="mt-1 text-slate-800 dark:text-slate-100">
        Average: <span className="font-semibold">{d.average} km/l</span>
      </p>
      {d.baseline != null && <p className="text-slate-500 dark:text-slate-400">Baseline: {d.baseline} km/l</p>}
      {d.isAnomalous && (
        <p
          className="mt-1 flex items-center gap-1 font-medium"
          style={{ color: d.direction === "WORSE" ? COLOR_WORSE : COLOR_BETTER }}
        >
          <AlertTriangle size={12} />
          {d.direction === "WORSE" ? "Worse than baseline — flagged" : "Better than baseline — review"}
        </p>
      )}
    </div>
  );
}

export default function BaselineTrendChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const data: ChartDatum[] = points.map((p) => ({
    date: p.date,
    average: p.average,
    lowerBound: p.lowerBound,
    bandHeight: p.lowerBound != null && p.upperBound != null ? round2(p.upperBound - p.lowerBound) : null,
    isAnomalous: p.isAnomalous,
    direction: p.direction,
    label: p.label,
    baseline: p.baseline,
  }));

  const worseCount = points.filter((p) => p.isAnomalous && p.direction === "WORSE").length;
  const betterCount = points.filter((p) => p.isAnomalous && p.direction === "BETTER").length;

  if (points.length === 0) {
    return (
      <div className="glass-panel flex h-64 items-center justify-center p-6 text-sm text-slate-400">
        Not enough entries yet to plot a trend.
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COLOR_LINE }} /> Average km/l
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="h-2 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLOR_BAND }} /> Expected range
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap" style={{ color: COLOR_WORSE }}>
            <TrendingDown size={12} /> Worse ({worseCount})
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap" style={{ color: COLOR_BETTER }}>
            <TrendingUp size={12} /> Better ({betterCount})
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={COLOR_GRID} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11, fill: COLOR_AXIS }}
            axisLine={{ stroke: COLOR_GRID }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: COLOR_AXIS }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={["dataMin - 1", "dataMax + 1"]}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            dataKey="lowerBound"
            stackId="band"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            dataKey="bandHeight"
            stackId="band"
            stroke="none"
            fill={COLOR_BAND}
            isAnimationActive={false}
          />
          <Line
            dataKey="average"
            stroke={COLOR_LINE}
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
