"use client";

import { Route } from "lucide-react";
import type { UnloggedMileageSummary } from "@/lib/unloggedMileage";

interface UnloggedMileageListProps {
  summaries: UnloggedMileageSummary[];
}

export default function UnloggedMileageList({ summaries }: UnloggedMileageListProps) {
  if (summaries.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-slate-400">
        No unlogged running detected this month — every trip&apos;s readings line up.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {summaries.map((s) => (
        <div key={s.vehicle.id} className="glass-panel flex items-center gap-3 p-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300">
            <Route size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.vehicle.vehicle_no}</p>
            <p className="text-xs text-slate-400">
              {s.unloggedKm.toLocaleString("en-IN")} km unlogged across {s.gapCount} trip{s.gapCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
