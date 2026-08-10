"use client";

import { AlertTriangle, Fuel, Gauge, IndianRupee, Route } from "lucide-react";
import { computeFleetAverage } from "@/lib/validation";
import { formatInr } from "@/lib/utils";
import type { FuelEntry } from "@/lib/types";

interface FleetSummaryCardsProps {
  entries: FuelEntry[];
  fuelRateInr: number;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="glass-panel flex items-start gap-3 p-4">
      <span
        className={
          tone === "danger"
            ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
            : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold text-slate-900 dark:text-white">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function FleetSummaryCards({ entries, fuelRateInr }: FleetSummaryCardsProps) {
  const totalKms = entries.reduce((sum, e) => sum + e.total_kms, 0);
  const totalDiesel = entries.reduce((sum, e) => sum + e.diesel_consumed, 0);
  const totalCost = totalDiesel * fuelRateInr;
  const fleetAvg = computeFleetAverage(entries);
  const flaggedCount = entries.filter((e) => e.is_anomalous).length;
  const continuityCount = entries.filter((e) => e.is_continuity_broken).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard icon={<Route size={18} />} label="Total KMs" value={totalKms.toLocaleString("en-IN")} />
      <StatCard icon={<Fuel size={18} />} label="Diesel Consumed" value={`${totalDiesel.toLocaleString("en-IN")} L`} />
      <StatCard icon={<IndianRupee size={18} />} label="Est. Fuel Cost" value={formatInr(totalCost)} sub={`@ ₹${fuelRateInr}/L`} />
      <StatCard icon={<Gauge size={18} />} label="Fleet Average" value={fleetAvg != null ? `${fleetAvg} km/l` : "—"} />
      <StatCard
        icon={<AlertTriangle size={18} />}
        label="Flagged Entries"
        value={String(flaggedCount)}
        sub={continuityCount > 0 ? `+${continuityCount} odometer gap${continuityCount === 1 ? "" : "s"}` : undefined}
        tone={flaggedCount > 0 ? "danger" : "default"}
      />
    </div>
  );
}
