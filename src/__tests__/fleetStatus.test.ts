import { describe, expect, it } from "vitest";
import { computeFleetStatus } from "@/lib/fleetStatus";
import type { MaintenanceAlert } from "@/lib/maintenance";
import type { FuelEntry, Vehicle } from "@/lib/types";

const TODAY = new Date("2026-08-18T12:00:00.000Z");

function makeVehicle(id: string): Vehicle {
  return {
    id,
    vehicle_no: `V-${id}`,
    model: null,
    starting_odometer: 0,
    expected_avg: 7.5,
    tank_capacity: 100,
    created_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
  };
}

function makeEntry(vehicleId: string, date: string): FuelEntry {
  return {
    id: `${vehicleId}-${date}`,
    date,
    place: "Depot",
    vehicle_id: vehicleId,
    driver_id: "driver-1",
    onward_reading: 100,
    return_reading: 200,
    total_kms: 100,
    diesel_consumed: 13,
    average_kml: 7.7,
    is_continuity_broken: false,
    is_anomalous: false,
    anomaly_direction: null,
    anomaly_deviation_pct: null,
    notes: null,
    created_by: null,
    created_at: `${date}T09:00:00.000Z`,
    updated_at: `${date}T09:00:00.000Z`,
  };
}

describe("computeFleetStatus", () => {
  it("marks a vehicle with today's entry as ON_TRIP", () => {
    const vehicle = makeVehicle("a");
    const [info] = computeFleetStatus([vehicle], [makeEntry("a", "2026-08-18")], [], TODAY);
    expect(info.status).toBe("ON_TRIP");
    expect(info.daysSinceLastTrip).toBe(0);
  });

  it("marks a vehicle whose last trip was days ago as IDLE", () => {
    const vehicle = makeVehicle("b");
    const [info] = computeFleetStatus([vehicle], [makeEntry("b", "2026-08-14")], [], TODAY);
    expect(info.status).toBe("IDLE");
    expect(info.daysSinceLastTrip).toBe(4);
  });

  it("marks a vehicle with no entries at all as IDLE with no last-trip data", () => {
    const vehicle = makeVehicle("c");
    const [info] = computeFleetStatus([vehicle], [], [], TODAY);
    expect(info.status).toBe("IDLE");
    expect(info.lastEntry).toBeNull();
    expect(info.daysSinceLastTrip).toBeNull();
  });

  it("marks a vehicle with an overdue maintenance alert as SERVICE_DUE, even if it drove today", () => {
    const vehicle = makeVehicle("d");
    const alert: MaintenanceAlert = {
      vehicleId: "d",
      category: "Brakes",
      status: "OVERDUE",
      lastServiceDate: "2026-01-01",
      lastServiceOdometer: 0,
      currentOdometer: 50000,
      kmSinceService: 50000,
      kmThreshold: 30000,
      monthsSinceService: 7,
      monthsThreshold: null,
    };
    const [info] = computeFleetStatus([vehicle], [makeEntry("d", "2026-08-18")], [alert], TODAY);
    expect(info.status).toBe("SERVICE_DUE");
    expect(info.overdueCategories).toEqual(["Brakes"]);
  });

  it("ignores DUE_SOON (not yet overdue) alerts for status purposes", () => {
    const vehicle = makeVehicle("e");
    const alert: MaintenanceAlert = {
      vehicleId: "e",
      category: "Tyres",
      status: "DUE_SOON",
      lastServiceDate: "2026-01-01",
      lastServiceOdometer: 0,
      currentOdometer: 36000,
      kmSinceService: 36000,
      kmThreshold: 40000,
      monthsSinceService: 7,
      monthsThreshold: null,
    };
    const [info] = computeFleetStatus([vehicle], [], [alert], TODAY);
    expect(info.status).toBe("IDLE");
  });

  it("picks the most recent entry when a vehicle has multiple", () => {
    const vehicle = makeVehicle("f");
    const entries = [makeEntry("f", "2026-08-10"), makeEntry("f", "2026-08-18"), makeEntry("f", "2026-08-15")];
    const [info] = computeFleetStatus([vehicle], entries, [], TODAY);
    expect(info.lastEntry?.date).toBe("2026-08-18");
    expect(info.status).toBe("ON_TRIP");
  });
});
