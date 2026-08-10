"use client";

import { useMemo } from "react";
import { AlertTriangle, GitBranch, ShieldAlert, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Driver, FlagSeverityRank, FuelEntry, Vehicle } from "@/lib/types";

interface FlaggedAlertsListProps {
  entries: FuelEntry[];
  vehicles: Vehicle[];
  drivers: Driver[];
  limit?: number;
}

interface AlertCard {
  entry: FuelEntry;
  vehicleNo: string;
  driverName: string;
  severityRank: FlagSeverityRank;
  message: string;
  kind: "WORSE" | "BETTER" | "CONTINUITY";
}

const SEVERITY_ORDER: Record<FlagSeverityRank, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export default function FlaggedAlertsList({ entries, vehicles, drivers, limit }: FlaggedAlertsListProps) {
  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const driverMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  const alerts = useMemo(() => {
    const byVehicleSorted = new Map<string, FuelEntry[]>();
    for (const e of entries) {
      const list = byVehicleSorted.get(e.vehicle_id) ?? [];
      list.push(e);
      byVehicleSorted.set(e.vehicle_id, list);
    }
    byVehicleSorted.forEach((list) => list.sort((a, b) => a.created_at.localeCompare(b.created_at)));

    const cards: AlertCard[] = [];

    for (const entry of entries) {
      const vehicleNo = vehicleMap.get(entry.vehicle_id)?.vehicle_no ?? "Unknown vehicle";
      const driverName = driverMap.get(entry.driver_id)?.name ?? "Unknown driver";

      if (entry.is_anomalous && entry.anomaly_direction && entry.anomaly_deviation_pct != null) {
        const baseline = Math.round((entry.average_kml / (1 + entry.anomaly_deviation_pct / 100)) * 100) / 100;
        const pct = Math.abs(entry.anomaly_deviation_pct).toFixed(1);
        const sign = entry.anomaly_deviation_pct < 0 ? "-" : "+";
        cards.push({
          entry,
          vehicleNo,
          driverName,
          severityRank: entry.anomaly_direction === "WORSE" ? "HIGH" : "MEDIUM",
          kind: entry.anomaly_direction,
          message: `Vehicle ${vehicleNo}, ${formatDate(entry.date)}: average ${entry.average_kml} km/l vs baseline ${baseline} km/l (${sign}${pct}%) — flagged for review.`,
        });
      }

      if (entry.is_continuity_broken) {
        const vehicleEntries = byVehicleSorted.get(entry.vehicle_id) ?? [];
        const idx = vehicleEntries.findIndex((e) => e.id === entry.id);
        const previous = idx > 0 ? vehicleEntries[idx - 1] : null;
        const expected = previous ? previous.return_reading : vehicleMap.get(entry.vehicle_id)?.starting_odometer;
        cards.push({
          entry,
          vehicleNo,
          driverName,
          severityRank: "LOW",
          kind: "CONTINUITY",
          message: `Odometer gap detected! Vehicle ${vehicleNo}, ${formatDate(entry.date)}: onward reading ${entry.onward_reading} km doesn't match expected ${expected ?? "—"} km from the previous trip.`,
        });
      }
    }

    cards.sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.severityRank] - SEVERITY_ORDER[b.severityRank];
      if (bySeverity !== 0) return bySeverity;
      return b.entry.date.localeCompare(a.entry.date) || b.entry.created_at.localeCompare(a.entry.created_at);
    });

    return limit ? cards.slice(0, limit) : cards;
  }, [entries, vehicleMap, driverMap, limit]);

  if (alerts.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-slate-400">
        No flagged entries — everything checks out.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => {
        const styles =
          alert.kind === "WORSE"
            ? { icon: ShieldAlert, badge: "badge-worse", label: "Worse than baseline" }
            : alert.kind === "BETTER"
              ? { icon: TrendingUp, badge: "badge-better", label: "Better than baseline" }
              : { icon: GitBranch, badge: "badge-warning", label: "Odometer gap" };
        const Icon = styles.icon;

        return (
          <div key={`${alert.entry.id}-${alert.kind}-${idx}`} className="glass-panel flex items-start gap-3 p-3.5">
            <span
              className={
                alert.kind === "WORSE"
                  ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                  : alert.kind === "BETTER"
                    ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300"
                    : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
              }
            >
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
