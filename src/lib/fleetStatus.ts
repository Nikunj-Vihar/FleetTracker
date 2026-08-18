// Per-vehicle operational status for the dashboard's fleet status board.
// There's no live telematics feed, so "status" is inferred from what the
// paper-log-derived data actually tells us: whether today's trip has been
// logged, how long it's been since the last one, and whether any tracked
// maintenance category is overdue.

import type { FuelEntry, Vehicle } from "./types";
import type { MaintenanceAlert } from "./maintenance";

export type VehicleStatus = "ON_TRIP" | "SERVICE_DUE" | "IDLE";

export interface VehicleStatusInfo {
  vehicle: Vehicle;
  status: VehicleStatus;
  lastEntry: FuelEntry | null;
  daysSinceLastTrip: number | null;
  overdueCategories: string[];
}

// Service-due takes priority over on-trip: a vehicle that drove today but
// is also overdue for brakes still needs the red flag, not a green one.
export function computeFleetStatus(
  vehicles: Vehicle[],
  entries: FuelEntry[],
  maintenanceAlerts: MaintenanceAlert[],
  today: Date = new Date()
): VehicleStatusInfo[] {
  const todayIso = today.toISOString().slice(0, 10);

  const overdueByVehicle = new Map<string, string[]>();
  for (const alert of maintenanceAlerts) {
    if (alert.status !== "OVERDUE") continue;
    const list = overdueByVehicle.get(alert.vehicleId) ?? [];
    list.push(alert.category);
    overdueByVehicle.set(alert.vehicleId, list);
  }

  const latestEntryByVehicle = new Map<string, FuelEntry>();
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
  );
  for (const entry of sorted) {
    latestEntryByVehicle.set(entry.vehicle_id, entry);
  }

  return vehicles.map((vehicle) => {
    const lastEntry = latestEntryByVehicle.get(vehicle.id) ?? null;
    const overdueCategories = overdueByVehicle.get(vehicle.id) ?? [];
    const daysSinceLastTrip = lastEntry
      ? Math.floor(
          (new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${lastEntry.date}T00:00:00`).getTime()) /
            86_400_000
        )
      : null;

    let status: VehicleStatus;
    if (overdueCategories.length > 0) {
      status = "SERVICE_DUE";
    } else if (lastEntry?.date === todayIso) {
      status = "ON_TRIP";
    } else {
      status = "IDLE";
    }

    return { vehicle, status, lastEntry, daysSinceLastTrip, overdueCategories };
  });
}
