// Sample data transcribed directly from the client's actual paper "Vehicle
// Running Status" sheets (25 Apr - 4 May 2026), used to seed the
// LocalStorage engine (see store.ts#seedLocalSampleData) and reused by
// validation.test.ts so the anomaly threshold test runs against the
// client's own real numbers rather than a synthetic stand-in.
//
// Only the raw fields the driver actually wrote down (date, place, driver,
// vehicle, return/onward readings, diesel) are transcribed here — Total
// KMS and Average are left for the engine to compute, exactly like the
// live app does, rather than hand-copying the paper's own arithmetic.
// That matters: one of the real rows (vehicle 5809, 2 May) has a paper
// average that doesn't actually match its own onward/return/diesel
// figures — precisely the kind of hand-arithmetic slip this tool exists
// to eliminate.
//
// Vehicle 5809 (driver Gopal) is the one the client themselves flagged —
// its 25 Apr entry's average was circled/written in red on the original
// sheet. Its three logged trips all come in around 5.5-6.2 km/l against
// what the client's other two trucks run (high-7s to high-8s), which is
// why its baseline below is seeded at 7.8 km/l (matching the fleet's
// general expectation) rather than left blank — leaving it blank would
// let the engine treat 5.5-6.2 as 5809's own "normal" after only a
// couple of entries and stop flagging it, silently erasing the exact
// signal that made the client suspicious in the first place.

import { checkContinuity, computeFields, computeVehicleBaseline, detectAnomaly } from "./validation";
import type { Driver, FuelEntry, Vehicle } from "./types";

export const sampleVehicles: Vehicle[] = [
  {
    id: "veh-2392",
    vehicle_no: "2392",
    model: null,
    starting_odometer: 73957,
    expected_avg: 7.8,
    tank_capacity: 100,
    created_at: "2026-04-25T05:00:00.000Z",
  },
  {
    id: "veh-7326",
    vehicle_no: "7326",
    model: null,
    starting_odometer: 182327,
    expected_avg: 8.75,
    tank_capacity: 150,
    created_at: "2026-04-25T05:00:00.000Z",
  },
  {
    id: "veh-5809",
    vehicle_no: "5809",
    model: null,
    starting_odometer: 377400,
    expected_avg: 7.8, // seeded from the fleet's general expectation — see note above
    tank_capacity: 200,
    created_at: "2026-04-25T05:00:00.000Z",
  },
];

export const sampleDrivers: Driver[] = [
  { id: "drv-abhi", name: "Abhi", phone: null, created_at: "2026-04-25T05:00:00.000Z" },
  { id: "drv-gb", name: "G.B", phone: null, created_at: "2026-04-25T05:00:00.000Z" },
  { id: "drv-gopal", name: "Gopal", phone: null, created_at: "2026-04-25T05:00:00.000Z" },
];

interface TripSeed {
  driverId: string;
  date: string;
  place: string | null;
  onward: number;
  return: number;
  diesel: number;
}

function buildEntriesForVehicle(vehicle: Vehicle, trips: TripSeed[], thresholdPct = 8): FuelEntry[] {
  const entries: FuelEntry[] = [];

  trips.forEach((trip, idx) => {
    const computed = computeFields(trip.onward, trip.return, trip.diesel);
    const previousReturnReading = idx === 0 ? null : entries[idx - 1].return_reading;
    const continuity = checkContinuity(trip.onward, previousReturnReading);
    const baseline = computeVehicleBaseline(vehicle, entries);
    const anomaly = detectAnomaly(computed.average_kml, baseline, thresholdPct);

    const timestamp = new Date(`${trip.date}T09:00:00.000Z`).toISOString();

    entries.push({
      id: `${vehicle.id}-e${idx + 1}`,
      date: trip.date,
      place: trip.place,
      vehicle_id: vehicle.id,
      driver_id: trip.driverId,
      onward_reading: trip.onward,
      return_reading: trip.return,
      total_kms: computed.total_kms,
      diesel_consumed: trip.diesel,
      average_kml: computed.average_kml,
      is_continuity_broken: continuity.isBroken,
      is_anomalous: anomaly.isAnomalous,
      anomaly_direction: anomaly.direction,
      anomaly_deviation_pct: anomaly.deviationPct,
      notes: null,
      created_by: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
  });

  return entries;
}

// Vehicle 2392, driver Abhi
const VEHICLE_2392_TRIPS: TripSeed[] = [
  { driverId: "drv-abhi", date: "2026-04-25", place: null, onward: 73957, return: 74084, diesel: 16 },
  { driverId: "drv-abhi", date: "2026-04-28", place: null, onward: 74084, return: 74210, diesel: 16 },
  { driverId: "drv-abhi", date: "2026-04-30", place: null, onward: 74210, return: 74513, diesel: 40 },
  { driverId: "drv-abhi", date: "2026-05-01", place: null, onward: 74513, return: 74641, diesel: 17 },
  { driverId: "drv-abhi", date: "2026-05-04", place: null, onward: 74641, return: 74771, diesel: 17 },
];

// Vehicle 7326, driver G.B
const VEHICLE_7326_TRIPS: TripSeed[] = [
  { driverId: "drv-gb", date: "2026-04-25", place: null, onward: 182327, return: 182668, diesel: 39 },
  { driverId: "drv-gb", date: "2026-04-30", place: null, onward: 182668, return: 183055, diesel: 44 },
  { driverId: "drv-gb", date: "2026-05-04", place: null, onward: 183055, return: 183346, diesel: 33 },
];

// Vehicle 5809, driver Gopal — the client's own real-world flagged vehicle
const VEHICLE_5809_TRIPS: TripSeed[] = [
  { driverId: "drv-gopal", date: "2026-04-25", place: "Tirupati -> Rajahmundry", onward: 377400, return: 377819, diesel: 76 },
  { driverId: "drv-gopal", date: "2026-04-29", place: "Tirupati & Rajahmundry", onward: 377819, return: 378136, diesel: 56 },
  { driverId: "drv-gopal", date: "2026-05-02", place: "Tirupati", onward: 378136, return: 378390, diesel: 41 },
];

export function buildSampleEntries(vehicles: Vehicle[], _drivers: Driver[]): FuelEntry[] {
  const byNo = new Map(vehicles.map((v) => [v.vehicle_no, v]));
  const v2392 = byNo.get("2392")!;
  const v7326 = byNo.get("7326")!;
  const v5809 = byNo.get("5809")!;

  return [
    ...buildEntriesForVehicle(v2392, VEHICLE_2392_TRIPS),
    ...buildEntriesForVehicle(v7326, VEHICLE_7326_TRIPS),
    ...buildEntriesForVehicle(v5809, VEHICLE_5809_TRIPS),
  ];
}
