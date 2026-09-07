"use client";

import { Fuel, Gauge, IndianRupee, Route, TrendingDown, TrendingUp } from "lucide-react";
import { computeFleetAverage } from "@/lib/validation";
import { computePeriodDelta, deltaTone, splitByPeriod, type GoodDirection, type PeriodDelta } from "@/lib/kpiTrend";
import { formatInr } from "@/lib/utils";
import type { FuelEntry } from "@/lib/types";

interface FleetSummaryCardsProps {
  entries: FuelEntry[];
  fuelRateInr: number;
}

// Small trend chip shown under a tile's value — "how did the last 30 days
// compare to the 30 before that," not a bare number with no context (per
// fleet-SaaS dashboard research). goodDirection decides the badge tone:
// never a reflexive green-up/red-down, since more cost/km/diesel isn't
// inherently bad — it may just mean more trips ran.
function TrendChip({ delta, goodDirection }: { delta: PeriodDelta; goodDirection: GoodDirection }) {
  if (delta.direction === "FLAT" || delta.previous == null) return null;
  const tone = deltaTone(delta, goodDirection);
  const toneClass = tone === "good" ? "badge-good" : tone === "worse" ? "badge-worse" : "badge-neutral";
  const Icon = delta.direction === "DOWN" ? TrendingDown : TrendingUp;
  return (
    <span className={`badge ${toneClass} mt-1 w-fit text-[10px]`}>
      <Icon size={10} />
      {delta.deltaPct != null ? `${Math.abs(delta.deltaPct).toFixed(0)}%` : "New"} / 30d
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  delta,
  goodDirection,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: PeriodDelta;
  goodDirection?: GoodDirection;
}) {
  return (
    <div className="glass-panel flex items-start gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold text-slate-900 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
        {delta && goodDirection && <TrendChip delta={delta} goodDirection={goodDirection} />}
      </div>
    </div>
  );
}

export default function FleetSummaryCards({ entries, fuelRateInr }: FleetSummaryCardsProps) {
  const totalKms = entries.reduce((sum, e) => sum + e.total_kms, 0);
  const totalDiesel = entries.reduce((sum, e) => sum + e.diesel_consumed, 0);
  const totalCost = totalDiesel * fuelRateInr;
  const fleetAvg = computeFleetAverage(entries);

  // Trend chips compare the rate of the last 30 days against the 30 days
  // before that — describing recent momentum, not the all-time totals
  // shown above them.
  const { current: currentEntries, previous: previousEntries } = splitByPeriod(entries, (e) => e.date, 30);
  const kmsDelta = computePeriodDelta(
    currentEntries.reduce((sum, e) => sum + e.total_kms, 0),
    previousEntries.length ? previousEntries.reduce((sum, e) => sum + e.total_kms, 0) : null
  );
  const dieselDelta = computePeriodDelta(
    currentEntries.reduce((sum, e) => sum + e.diesel_consumed, 0),
    previousEntries.length ? previousEntries.reduce((sum, e) => sum + e.diesel_consumed, 0) : null
  );
  const costDelta = computePeriodDelta(
    currentEntries.reduce((sum, e) => sum + e.diesel_consumed, 0) * fuelRateInr,
    previousEntries.length ? previousEntries.reduce((sum, e) => sum + e.diesel_consumed, 0) * fuelRateInr : null
  );
  const currentAvg = computeFleetAverage(currentEntries);
  const avgDelta = currentAvg != null ? computePeriodDelta(currentAvg, computeFleetAverage(previousEntries)) : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard icon={<Route size={18} />} label="Total KMs" value={totalKms.toLocaleString("en-IN")} delta={kmsDelta} goodDirection="neutral" />
      <StatCard
        icon={<Fuel size={18} />}
        label="Diesel Consumed"
        value={`${totalDiesel.toLocaleString("en-IN")} L`}
        delta={dieselDelta}
        goodDirection="neutral"
      />
      <StatCard
        icon={<IndianRupee size={18} />}
        label="Est. Fuel Cost"
        value={formatInr(totalCost)}
        sub={`@ ₹${fuelRateInr}/L`}
        delta={costDelta}
        goodDirection="neutral"
      />
      <StatCard
        icon={<Gauge size={18} />}
        label="Fleet Average"
        value={fleetAvg != null ? `${fleetAvg} km/l` : "—"}
        delta={avgDelta}
        goodDirection="up"
      />
    </div>
  );
}
