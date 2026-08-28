// Builds the "flagged entries" cards shown both inline on the Dashboard
// (FlaggedAlertsList) and in the navbar's notification bell — one shared
// implementation so the two surfaces can never disagree about what counts
// as flagged or how it's worded.

import { GitBranch, ShieldAlert, TrendingUp, type LucideIcon } from "lucide-react";
import { annotateContinuitySeverity, DEFAULT_GAP_TOLERANCE_KM } from "./validation";
import { formatDate } from "./utils";
import type { Driver, FlagSeverityRank, FuelEntry, Vehicle } from "./types";

export interface FlaggedAlertCard {
  entry: FuelEntry;
  vehicleNo: string;
  driverName: string;
  severityRank: FlagSeverityRank;
  message: string;
  kind: "WORSE" | "BETTER" | "CONTINUITY" | "CONTINUITY_MINOR";
}

const SEVERITY_ORDER: Record<FlagSeverityRank, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function computeFlaggedAlerts(
  entries: FuelEntry[],
  vehicles: Vehicle[],
  drivers: Driver[],
  defaultGapToleranceKm: number = DEFAULT_GAP_TOLERANCE_KM
): FlaggedAlertCard[] {
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const driverMap = new Map(drivers.map((d) => [d.id, d]));
  const continuitySeverity = annotateContinuitySeverity(entries, vehicles, defaultGapToleranceKm);

  const byVehicleSorted = new Map<string, FuelEntry[]>();
  for (const e of entries) {
    const list = byVehicleSorted.get(e.vehicle_id) ?? [];
    list.push(e);
    byVehicleSorted.set(e.vehicle_id, list);
  }
  byVehicleSorted.forEach((list) => list.sort((a, b) => a.created_at.localeCompare(b.created_at)));

  const cards: FlaggedAlertCard[] = [];

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
      const severity = continuitySeverity.get(entry.id) ?? "WARNING";
      cards.push({
        entry,
        vehicleNo,
        driverName,
        severityRank: "LOW",
        kind: severity === "INFO" ? "CONTINUITY_MINOR" : "CONTINUITY",
        message: `Odometer gap detected! Vehicle ${vehicleNo}, ${formatDate(entry.date)}: onward reading ${entry.onward_reading} km doesn't match expected ${expected ?? "—"} km from the previous trip.`,
      });
    }
  }

  cards.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severityRank] - SEVERITY_ORDER[b.severityRank];
    if (bySeverity !== 0) return bySeverity;
    return b.entry.date.localeCompare(a.entry.date) || b.entry.created_at.localeCompare(a.entry.created_at);
  });

  return cards;
}

export interface AlertKindStyle {
  icon: LucideIcon;
  badge: string;
  label: string;
  iconWrapClass: string;
}

// Shared icon/color mapping so the dashboard panel and the notification
// bell's preview never drift into rendering the same kind two different ways.
export function alertKindStyle(kind: FlaggedAlertCard["kind"]): AlertKindStyle {
  switch (kind) {
    case "WORSE":
      return {
        icon: ShieldAlert,
        badge: "badge-worse",
        label: "Worse than baseline",
        iconWrapClass: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
      };
    case "BETTER":
      return {
        icon: TrendingUp,
        badge: "badge-better",
        label: "Better than baseline",
        iconWrapClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
      };
    case "CONTINUITY_MINOR":
      return {
        icon: GitBranch,
        badge: "badge-neutral",
        label: "Minor gap",
        iconWrapClass: "bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-300",
      };
    case "CONTINUITY":
      return {
        icon: GitBranch,
        badge: "badge-warning",
        label: "Odometer gap",
        iconWrapClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
      };
  }
}
