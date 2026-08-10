// CSV export — the client's offline copy of their own data (build prompt
// §8: "they shouldn't be more dependent on your hosting than they were on
// a filing cabinet").

import type { Driver, FuelEntry, Vehicle } from "./types";

function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function entriesToCsv(entries: FuelEntry[], vehicles: Vehicle[], drivers: Driver[]): string {
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
  const driverMap = new Map(drivers.map((d) => [d.id, d]));

  const headers = [
    "Date",
    "Place",
    "Vehicle No",
    "Driver",
    "Onward Reading",
    "Return Reading",
    "Total KMS",
    "Diesel Consumed (L)",
    "Average (km/l)",
    "Continuity Broken",
    "Anomalous",
    "Anomaly Direction",
    "Anomaly Deviation %",
    "Notes",
  ];

  const rows = entries.map((e) => [
    e.date,
    e.place ?? "",
    vehicleMap.get(e.vehicle_id)?.vehicle_no ?? e.vehicle_id,
    driverMap.get(e.driver_id)?.name ?? e.driver_id,
    e.onward_reading,
    e.return_reading,
    e.total_kms,
    e.diesel_consumed,
    e.average_kml,
    e.is_continuity_broken ? "YES" : "NO",
    e.is_anomalous ? "YES" : "NO",
    e.anomaly_direction ?? "",
    e.anomaly_deviation_pct ?? "",
    e.notes ?? "",
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
