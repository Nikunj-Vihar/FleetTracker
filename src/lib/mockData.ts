// Illustrative sample data for the LocalStorage demo path (see
// store.ts#seedLocalSampleData) and reused by validation.test.ts so the
// anomaly-threshold tests run against realistic-shaped numbers rather than
// arbitrary ones. Fictional vehicles/drivers/figures throughout — not any
// real fleet's data.
//
// Only the raw fields a driver would actually write down (date, place,
// driver, vehicle, return/onward readings, diesel) are set here — Total
// KMS and Average are left for the engine to compute, exactly like the
// live app does, rather than hand-copying pre-computed numbers. That
// matters: a hand-tallied paper log's own arithmetic mistakes should never
// be able to leak into the system just because someone typed the wrong
// total.
//
// Vehicle C (driver Manoj) is deliberately the one that runs consistently
// below the fleet's expected average — the demo case for what the anomaly
// engine exists to catch (potential fuel theft, a leak, under-inflated
// tyres, or a driver behavior issue), seeded at 7.8 km/l so the engine has
// something to compare against from its very first entry.

import { checkContinuity, computeFields, computeVehicleBaseline, detectAnomaly } from "./validation";
import type { Driver, FuelEntry, Garage, GarageExpense, Vehicle } from "./types";

export const sampleVehicles: Vehicle[] = [
  {
    id: "veh-1",
    vehicle_no: "4417",
    model: null,
    starting_odometer: 51200,
    expected_avg: 7.8,
    tank_capacity: 100,
    created_at: "2026-04-25T05:00:00.000Z",
  },
  {
    id: "veh-2",
    vehicle_no: "8256",
    model: null,
    starting_odometer: 142780,
    expected_avg: 8.75,
    tank_capacity: 150,
    created_at: "2026-04-25T05:00:00.000Z",
  },
  {
    id: "veh-3",
    vehicle_no: "6039",
    model: null,
    starting_odometer: 298450,
    expected_avg: 7.8, // seeded from the fleet's general expectation — see note above
    tank_capacity: 200,
    created_at: "2026-04-25T05:00:00.000Z",
  },
];

export const sampleDrivers: Driver[] = [
  { id: "drv-suresh", name: "Suresh", phone: null, created_at: "2026-04-25T05:00:00.000Z" },
  { id: "drv-naik", name: "R. Naik", phone: null, created_at: "2026-04-25T05:00:00.000Z" },
  { id: "drv-manoj", name: "Manoj", phone: null, created_at: "2026-04-25T05:00:00.000Z" },
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

// Vehicle 4417, driver Suresh — runs within the expected band throughout
const VEHICLE_1_TRIPS: TripSeed[] = [
  { driverId: "drv-suresh", date: "2026-04-25", place: null, onward: 51200, return: 51327, diesel: 16 },
  { driverId: "drv-suresh", date: "2026-04-28", place: null, onward: 51327, return: 51453, diesel: 16 },
  { driverId: "drv-suresh", date: "2026-04-30", place: null, onward: 51453, return: 51756, diesel: 40 },
  { driverId: "drv-suresh", date: "2026-05-01", place: null, onward: 51756, return: 51884, diesel: 17 },
  { driverId: "drv-suresh", date: "2026-05-04", place: null, onward: 51884, return: 52014, diesel: 17 },
];

// Vehicle 8256, driver R. Naik — also within the expected band throughout
const VEHICLE_2_TRIPS: TripSeed[] = [
  { driverId: "drv-naik", date: "2026-04-25", place: null, onward: 142780, return: 143121, diesel: 39 },
  { driverId: "drv-naik", date: "2026-04-30", place: null, onward: 143121, return: 143508, diesel: 44 },
  { driverId: "drv-naik", date: "2026-05-04", place: null, onward: 143508, return: 143799, diesel: 33 },
];

// Vehicle 6039, driver Manoj — the demo's flagged vehicle (see header note)
const VEHICLE_3_TRIPS: TripSeed[] = [
  { driverId: "drv-manoj", date: "2026-04-25", place: "Depot A -> Depot B", onward: 298450, return: 298905, diesel: 80 },
  { driverId: "drv-manoj", date: "2026-04-29", place: "Depot A & Depot B", onward: 298905, return: 299247, diesel: 58 },
  { driverId: "drv-manoj", date: "2026-05-02", place: "Depot A", onward: 299247, return: 299530, diesel: 46 },
];

export function buildSampleEntries(vehicles: Vehicle[], _drivers: Driver[]): FuelEntry[] {
  const byNo = new Map(vehicles.map((v) => [v.vehicle_no, v]));
  const v1 = byNo.get("4417")!;
  const v2 = byNo.get("8256")!;
  const v3 = byNo.get("6039")!;

  return [
    ...buildEntriesForVehicle(v1, VEHICLE_1_TRIPS),
    ...buildEntriesForVehicle(v2, VEHICLE_2_TRIPS),
    ...buildEntriesForVehicle(v3, VEHICLE_3_TRIPS),
  ];
}

// Illustrative garage/maintenance ledger data — same per-vehicle,
// per-bill shape as the real client's paper ledger (Date | K.M's | Type
// of Work/Replacement | Garage | Bill No | Total Cost), with fictional
// vehicles, garages, and figures.
export const sampleGarages: Garage[] = [
  { id: "grg-metro", name: "Metro Tyres", phone: null, created_at: "2026-06-03T05:00:00.000Z" },
  { id: "grg-omsai", name: "Om Sai Motors", phone: null, created_at: "2026-06-03T05:00:00.000Z" },
];

export function buildSampleGarageExpenses(vehicles: Vehicle[], garages: Garage[]): GarageExpense[] {
  const byNo = new Map(vehicles.map((v) => [v.vehicle_no, v]));
  const byGarageName = new Map(garages.map((g) => [g.name, g]));
  const v1 = byNo.get("4417")!;
  const v2 = byNo.get("8256")!;
  const metro = byGarageName.get("Metro Tyres")!;

  const now = "2026-06-11T09:00:00.000Z";

  return [
    {
      id: "gex-1-1",
      date: "2026-06-03",
      vehicle_id: v1.id,
      odometer_reading: 52400,
      work_description: "2 front tyres replaced (Metro Tyres); 2 tyres given for retreading (Om Sai Motors)",
      garage_id: metro.id,
      bill_no: "MT-2210 / OS-88",
      amount: 12500,
      category: "Garage/Maintenance",
      notes: "Combined bill across two garages on the same date — paper ledger recorded one total for both jobs.",
      created_by: null,
      created_at: "2026-06-03T09:00:00.000Z",
      updated_at: "2026-06-03T09:00:00.000Z",
    },
    {
      id: "gex-2-1",
      date: "2026-06-11",
      vehicle_id: v2.id,
      odometer_reading: 144200,
      work_description: "Front tyre replaced",
      garage_id: metro.id,
      bill_no: "MT-2355",
      amount: 15800,
      category: "Garage/Maintenance",
      notes: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    },
  ];
}
