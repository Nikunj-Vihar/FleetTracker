// Vehicle/driver pairing suggestions for the Log Trip form. Most trucks
// have one or two regular drivers even though any driver can technically
// take any truck (CLAUDE.md's per-driver tracking exists precisely because
// that does happen) — this ranks past pairings by all-time trip count so
// the common case is one click (or zero, via auto-fill) instead of a
// search through the full driver/vehicle list every time.

import type { FuelEntry } from "./types";

export interface PairingRank {
  id: string;
  count: number;
}

function rankPairings(entries: FuelEntry[], matchField: "vehicle_id" | "driver_id", rankField: "vehicle_id" | "driver_id"): PairingRank[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const id = entry[rankField];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

export function rankDriversForVehicle(entries: FuelEntry[], vehicleId: string): PairingRank[] {
  return rankPairings(
    entries.filter((e) => e.vehicle_id === vehicleId),
    "vehicle_id",
    "driver_id"
  );
}

export function rankVehiclesForDriver(entries: FuelEntry[], driverId: string): PairingRank[] {
  return rankPairings(
    entries.filter((e) => e.driver_id === driverId),
    "driver_id",
    "vehicle_id"
  );
}

// Reorders `items` so ids appearing in `ranked` (highest count first) come
// first, with everything else following in its original order.
export function reorderByRank<T>(items: T[], getId: (item: T) => string, ranked: PairingRank[]): T[] {
  if (ranked.length === 0) return items;
  const rankIndex = new Map(ranked.map((r, idx) => [r.id, idx]));
  return [...items].sort((a, b) => {
    const ra = rankIndex.get(getId(a));
    const rb = rankIndex.get(getId(b));
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return 0;
  });
}
