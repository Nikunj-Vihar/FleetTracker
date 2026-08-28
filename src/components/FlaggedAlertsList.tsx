"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { alertKindStyle, computeFlaggedAlerts } from "@/lib/flaggedAlerts";
import { DEFAULT_GAP_TOLERANCE_KM } from "@/lib/validation";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

interface FlaggedAlertsListProps {
  entries: FuelEntry[];
  vehicles: Vehicle[];
  drivers: Driver[];
  defaultGapToleranceKm?: number;
  limit?: number;
}

export default function FlaggedAlertsList({
  entries,
  vehicles,
  drivers,
  defaultGapToleranceKm = DEFAULT_GAP_TOLERANCE_KM,
  limit,
}: FlaggedAlertsListProps) {
  const alerts = useMemo(() => {
    const cards = computeFlaggedAlerts(entries, vehicles, drivers, defaultGapToleranceKm);
    return limit ? cards.slice(0, limit) : cards;
  }, [entries, vehicles, drivers, defaultGapToleranceKm, limit]);

  if (alerts.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-slate-400">
        No flagged entries — everything checks out.
      </div>
    );
  }

  return (
    // Capped + internally scrollable so a long flagged list can't stretch
    // this grid row taller than its sibling (the trend chart) — Grid's
    // default align-items: stretch was otherwise leaving dead whitespace
    // under the shorter chart panel, and the page kept growing with the
    // flagged count.
    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
      {alerts.map((alert, idx) => {
        const styles = alertKindStyle(alert.kind);
        const Icon = styles.icon;

        return (
          <div key={`${alert.entry.id}-${alert.kind}-${idx}`} className="glass-panel flex items-start gap-3 p-3.5">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.iconWrapClass}`}>
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className={`badge ${styles.badge}`}>
                  <AlertTriangle size={11} /> {styles.label}
                </span>
                {alert.severityRank === "HIGH" && (
                  <span className="badge badge-neutral">High priority</span>
                )}
                <span className="text-xs text-slate-400">Driver: {alert.driverName}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200">{alert.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
