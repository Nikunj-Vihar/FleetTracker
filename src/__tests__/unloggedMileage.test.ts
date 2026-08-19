import { describe, expect, it } from "vitest";
import { computeUnloggedMileage } from "@/lib/unloggedMileage";
import type { FuelEntry, Vehicle } from "@/lib/types";

function makeVehicle(id: string, startingOdometer = 0): Vehicle {
  return {
    id,
    vehicle_no: `V-${id}`,
    model: null,
    starting_odometer: startingOdometer,
    expected_avg: 7.5,
    tank_capacity: 100,
    created_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  };
}

function makeEntry(
  id: string,
  vehicleId: string,
  date: string,
  onward: number,
  ret: number
): FuelEntry {
  return {
    id,
    date,
    place: null,
    vehicle_id: vehicleId,
    driver_id: "driver-1",
    onward_reading: onward,
    return_reading: ret,
    total_kms: ret - onward,
    diesel_consumed: 10,
    average_kml: (ret - onward) / 10,
    is_continuity_broken: onward !== ret,
    is_anomalous: false,
    anomaly_direction: null,
    anomaly_deviation_pct: null,
    notes: null,
    created_by: null,
    created_at: `${date}T09:00:00.000Z`,
    updated_at: `${date}T09:00:00.000Z`,
  };
}

describe("computeUnloggedMileage", () => {
  it("sums positive gaps within the period, even ones small enough to have been within tolerance", () => {
    const vehicle = makeVehicle("a");
    const entries = [
      makeEntry("1", "a", "2026-08-01", 20, 120), // 20 km unlogged gap from starting_odometer 0
      makeEntry("2", "a", "2026-08-05", 130, 230), // 10 km unlogged gap
    ];
    const [summary] = computeUnloggedMileage([vehicle], entries, "2026-08-01");
    expect(summary.unloggedKm).toBe(30);
    expect(summary.gapCount).toBe(2);
  });

  it("excludes gaps that occurred before the cutoff date", () => {
    const vehicle = makeVehicle("b");
    const entries = [
      makeEntry("1", "b", "2026-07-15", 20, 120), // before the cutoff
      makeEntry("2", "b", "2026-08-05", 130, 230), // 10 km gap, on/after the cutoff
    ];
    const [summary] = computeUnloggedMileage([vehicle], entries, "2026-08-01");
    expect(summary.unloggedKm).toBe(10);
    expect(summary.gapCount).toBe(1);
  });

  it("ignores negative gaps entirely (a data problem, not unlogged mileage)", () => {
    const vehicle = makeVehicle("c");
    // First entry is perfectly continuous (starting_odometer 0 -> onward 0).
    // Second entry's onward (150) is LESS than the first's return (200) —
    // a negative gap, which should never count toward unlogged mileage.
    const entries = [
      makeEntry("0", "c", "2026-08-01", 0, 200),
      makeEntry("1", "c", "2026-08-05", 150, 250),
    ];
    const summaries = computeUnloggedMileage([vehicle], entries, "2026-08-01");
    expect(summaries).toHaveLength(0);
  });

  it("omits a vehicle entirely when it has no unlogged mileage this period", () => {
    const vehicle = makeVehicle("d");
    const entries = [makeEntry("1", "d", "2026-08-05", 0, 100)]; // perfectly continuous from starting_odometer 0
    const summaries = computeUnloggedMileage([vehicle], entries, "2026-08-01");
    expect(summaries).toHaveLength(0);
  });

  it("sorts vehicles by unlogged km descending", () => {
    const vehicleA = makeVehicle("a");
    const vehicleB = makeVehicle("b");
    const entries = [
      makeEntry("1", "a", "2026-08-05", 10, 100),
      makeEntry("2", "b", "2026-08-05", 50, 150),
    ];
    const summaries = computeUnloggedMileage([vehicleA, vehicleB], entries, "2026-08-01");
    expect(summaries.map((s) => s.vehicle.id)).toEqual(["b", "a"]);
  });
});
