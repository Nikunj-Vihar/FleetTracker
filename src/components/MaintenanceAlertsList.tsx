"use client";

import { useMemo } from "react";
import { AlertOctagon, Clock, Wrench } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { MaintenanceAlert } from "@/lib/maintenance";
import type { Vehicle } from "@/lib/types";

interface MaintenanceAlertsListProps {
  alerts: MaintenanceAlert[];
  vehicles: Vehicle[];
  limit?: number;
}

function describe(alert: MaintenanceAlert): string {
  const parts: string[] = [];
  if (alert.kmSinceService != null && alert.kmThreshold != null) {
    parts.push(`${alert.kmSinceService.toLocaleString("en-IN")} km since last service (threshold ${alert.kmThreshold.toLocaleString("en-IN")} km)`);
  }
  if (alert.monthsThreshold != null) {
    parts.push(`${alert.monthsSinceService} month${alert.monthsSinceService === 1 ? "" : "s"} since last service (threshold ${alert.monthsThreshold} mo)`);
  }
  return parts.join(" · ");
}

export default function MaintenanceAlertsList({ alerts, vehicles, limit }: MaintenanceAlertsListProps) {
  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const visible = limit ? alerts.slice(0, limit) : alerts;

  if (alerts.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-slate-400">
        Nothing due — every vehicle&apos;s tracked maintenance is within its usual interval.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {visible.map((alert, idx) => {
        const vehicleNo = vehicleMap.get(alert.vehicleId)?.vehicle_no ?? "Unknown vehicle";
        const overdue = alert.status === "OVERDUE";
        const Icon = overdue ? AlertOctagon : Clock;
        return (
          <div key={`${alert.vehicleId}-${alert.category}-${idx}`} className="glass-panel flex items-start gap-3 p-3.5">
            <span
              className={
                overdue
                  ? "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300"
                  : "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
              }
            >
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className={`badge ${overdue ? "badge-worse" : "badge-warning"}`}>
                  <Wrench size={11} /> {overdue ? "Overdue" : "Due soon"}
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {vehicleNo} — {alert.category}
                </span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200">{describe(alert)}</p>
              <p className="mt-0.5 text-xs text-slate-400">Last service: {formatDate(alert.lastServiceDate)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
