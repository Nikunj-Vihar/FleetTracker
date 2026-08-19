// Even gaps small enough to fall within a vehicle's own learned tolerance
// (validation.ts's computeVehicleGapTolerance) are still real unlogged
// running — individually harmless, but a lot of individually-tolerable
// gaps can still add up to something worth knowing about over a month.
// This is that rollup: a quiet, cumulative view that doesn't depend on any
// single entry ever crossing the per-entry tolerance bar.

import type { FuelEntry, Vehicle } from "./types";

export interface UnloggedMileageSummary {
  vehicle: Vehicle;
  unloggedKm: number;
  gapCount: number;
}

export function computeUnloggedMileage(
  vehicles: Vehicle[],
  entries: FuelEntry[],
  sinceDateIso: string
): UnloggedMileageSummary[] {
  const byVehicle = new Map<string, FuelEntry[]>();
  for (const entry of entries) {
    const list = byVehicle.get(entry.vehicle_id) ?? [];
    list.push(entry);
    byVehicle.set(entry.vehicle_id, list);
  }
  byVehicle.forEach((list) => list.sort((a, b) => a.created_at.localeCompare(b.created_at)));

  const summaries: UnloggedMileageSummary[] = [];
  for (const vehicle of vehicles) {
    const vehicleEntries = byVehicle.get(vehicle.id) ?? [];
    let previousReturn = vehicle.starting_odometer;
    let unloggedKm = 0;
    let gapCount = 0;
    for (const entry of vehicleEntries) {
      const gap = entry.onward_reading - previousReturn;
      if (gap > 0 && entry.date >= sinceDateIso) {
        unloggedKm += gap;
        gapCount += 1;
      }
      previousReturn = entry.return_reading;
    }
    if (unloggedKm > 0) {
      summaries.push({ vehicle, unloggedKm: Math.round(unloggedKm * 100) / 100, gapCount });
    }
  }

  return summaries.sort((a, b) => b.unloggedKm - a.unloggedKm);
}
