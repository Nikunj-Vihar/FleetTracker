// Comprehensive unit test suite for the validation & anomaly detection
// engine — the actual product per CLAUDE.md. Mirrors the six integrity
// checks demanded by fleet-fuel-tracker-build-prompt.md §10.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONTINUITY_ESCALATION_MULTIPLIER,
  DEFAULT_ANOMALY_THRESHOLD_PCT,
  checkContinuity,
  classifyGapSeverity,
  computeFields,
  computeFleetAverage,
  computeVehicleBaseline,
  computeVehicleGapTolerance,
  detectAnomaly,
  evaluateEntry,
  validatePhysicalSanity,
} from "@/lib/validation";
import { buildSampleEntries, sampleDrivers, sampleVehicles } from "@/lib/mockData";
import { clearLocalData, correctEntry, createEntry, createVehicle, createDriver, listAuditLogs, listEntries, ValidationError } from "@/lib/store";
import type { Driver, FuelEntryInput, Vehicle } from "@/lib/types";

const VEHICLE_A: Vehicle = sampleVehicles[0]; // expected_avg 7.8, tank_capacity 100

// ---------------------------------------------------------------------
// §10.2 Computed-field test
// ---------------------------------------------------------------------

describe("computeFields — Total KMS & Average km/l", () => {
  it("computes Total KMS as return - onward and Average as KMS / diesel", () => {
    const result = computeFields(1000, 1320, 40);
    expect(result.total_kms).toBe(320);
    expect(result.average_kml).toBe(8);
  });

  it("returns 0 average when diesel consumed is 0 (guards against divide-by-zero)", () => {
    const result = computeFields(1000, 1200, 0);
    expect(result.total_kms).toBe(200);
    expect(result.average_kml).toBe(0);
  });

  it("FuelEntryInput has no total_kms/average_kml fields — they cannot be manually entered", () => {
    const input: FuelEntryInput = {
      date: "2026-05-01",
      vehicle_id: "v1",
      driver_id: "d1",
      onward_reading: 100,
      return_reading: 200,
      diesel_consumed: 10,
    };
    // @ts-expect-error total_kms is not part of FuelEntryInput by design
    expect(input.total_kms).toBeUndefined();
    // @ts-expect-error average_kml is not part of FuelEntryInput by design
    expect(input.average_kml).toBeUndefined();
  });

  it("recomputes correctly when the underlying readings change (simulating a correction)", () => {
    const original = computeFields(1000, 1300, 40); // 300 km / 40 L = 7.5
    const corrected = computeFields(1000, 1350, 40); // corrected return reading -> 350 km / 40L = 8.75
    expect(original.average_kml).toBe(7.5);
    expect(corrected.average_kml).toBe(8.75);
    expect(corrected.total_kms).not.toBe(original.total_kms);
  });

  it("handles the odometer-rollover override distinctly rather than folding it in silently", () => {
    const normal = computeFields(999900, 100, 25, false); // no rollover flag -> naive (negative) subtraction
    expect(normal.total_kms).toBe(100 - 999900);

    const rollover = computeFields(999900, 100, 25, true, 999999);
    // (999999 - 999900) + 100 = 199
    expect(rollover.total_kms).toBe(199);
  });
});

// ---------------------------------------------------------------------
// §10.1 Continuity check test
// ---------------------------------------------------------------------

describe("checkContinuity — odometer gap detection", () => {
  it("flags a broken chain when onward reading doesn't match the previous return reading", () => {
    const result = checkContinuity(1550, 1500);
    expect(result.isBroken).toBe(true);
    expect(result.expectedOnwardReading).toBe(1500);
    expect(result.gapKms).toBe(50);
  });

  it("does not flag a valid, continuous chain", () => {
    const result = checkContinuity(1500, 1500);
    expect(result.isBroken).toBe(false);
  });

  it("does not flag the very first entry for a vehicle (nothing to compare against)", () => {
    const result = checkContinuity(1000, null);
    expect(result.isBroken).toBe(false);
    expect(result.gapKms).toBeNull();
  });

  it("does not flag a gap within tolerance — an unlogged short trip", () => {
    const result = checkContinuity(1520, 1500, 25); // 20 km gap, 25 km tolerance
    expect(result.isBroken).toBe(false);
    expect(result.severity).toBeNull();
  });

  it("flags a gap just over tolerance as a quiet INFO note, not a prominent warning", () => {
    const result = checkContinuity(1530, 1500, 25); // 30 km gap, within 3x tolerance (75 km)
    expect(result.isBroken).toBe(true);
    expect(result.severity).toBe("INFO");
  });

  it("escalates a gap well past tolerance to a prominent WARNING", () => {
    const result = checkContinuity(1600, 1500, 25); // 100 km gap, past 3x tolerance (75 km)
    expect(result.isBroken).toBe(true);
    expect(result.severity).toBe("WARNING");
  });

  it("never tolerates a negative gap (onward reading less than previous return), regardless of tolerance size", () => {
    const result = checkContinuity(1490, 1500, 1000); // -10 km gap, even against a huge tolerance
    expect(result.isBroken).toBe(true);
    expect(result.severity).toBe("WARNING");
  });
});

describe("classifyGapSeverity — the boundary rules directly", () => {
  it("treats a gap exactly at tolerance as NONE (not broken)", () => {
    expect(classifyGapSeverity(25, 25)).toBe("NONE");
  });

  it("treats a gap exactly at the escalation boundary as INFO, not WARNING", () => {
    expect(classifyGapSeverity(25 * CONTINUITY_ESCALATION_MULTIPLIER, 25)).toBe("INFO");
  });

  it("treats a gap one km past the escalation boundary as WARNING", () => {
    expect(classifyGapSeverity(25 * CONTINUITY_ESCALATION_MULTIPLIER + 1, 25)).toBe("WARNING");
  });
});

describe("computeVehicleGapTolerance — self-calibrating per-vehicle tolerance", () => {
  it("falls back to the generic default when a vehicle has little or no history", () => {
    const tolerance = computeVehicleGapTolerance([], 0, 25);
    expect(tolerance).toBe(25);
  });

  it("learns toward its own typical gap size once it has enough history", () => {
    // 15 entries, each with a consistent ~20 km unlogged gap before it —
    // simulates a vehicle whose driver reliably skips short local trips.
    let previousReturn = 0;
    const entries: { onward_reading: number; return_reading: number }[] = [];
    for (let i = 0; i < 15; i++) {
      const onward = previousReturn + 20;
      const ret = onward + 100;
      entries.push({ onward_reading: onward, return_reading: ret });
      previousReturn = ret;
    }
    const tolerance = computeVehicleGapTolerance(entries, 0, 25 /* generic default */);
    // Fully blended (>= BASELINE_FULL_TRAILING_ENTRIES): should reflect the
    // vehicle's own ~20 km gaps rather than the generic 25 km default.
    expect(tolerance).toBeCloseTo(20, 0);
  });

  it("blends partway between the default and the learned value between the blend-start and full-trailing entry counts", () => {
    // 12 entries (between BASELINE_BLEND_START_ENTRIES=10 and
    // BASELINE_FULL_TRAILING_ENTRIES=15) with a consistent 60 km gap, well
    // above the 25 km default — the blended tolerance should sit strictly
    // between the two, not jump straight to the learned value.
    let previousReturn = 0;
    const entries: { onward_reading: number; return_reading: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const onward = previousReturn + 60;
      const ret = onward + 100;
      entries.push({ onward_reading: onward, return_reading: ret });
      previousReturn = ret;
    }
    const tolerance = computeVehicleGapTolerance(entries, 0, 25);
    expect(tolerance).toBeGreaterThan(25);
    expect(tolerance).toBeLessThan(60);
  });
});

// ---------------------------------------------------------------------
// §10.4 Sanity check test — HARD REJECT, not just flagged
// ---------------------------------------------------------------------

describe("validatePhysicalSanity — hard rejects", () => {
  it("hard-rejects negative KMS (return reading less than onward reading)", () => {
    const issues = validatePhysicalSanity(
      { date: "2026-05-01", vehicle_id: "v1", driver_id: "d1", onward_reading: 1000, return_reading: 900, diesel_consumed: 30 },
      { tank_capacity: 120 }
    );
    const negativeKmsIssue = issues.find((i) => i.code === "NEGATIVE_KMS");
    expect(negativeKmsIssue).toBeDefined();
    expect(negativeKmsIssue?.severity).toBe("ERROR");
  });

  it("hard-rejects diesel consumed above the vehicle's tank capacity", () => {
    const issues = validatePhysicalSanity(
      { date: "2026-05-01", vehicle_id: "v1", driver_id: "d1", onward_reading: 1000, return_reading: 1300, diesel_consumed: 150 },
      { tank_capacity: 120 }
    );
    const tankIssue = issues.find((i) => i.code === "EXCEEDS_TANK_CAPACITY");
    expect(tankIssue).toBeDefined();
    expect(tankIssue?.severity).toBe("ERROR");
  });

  it("a multiple-fill-ups override downgrades the tank-capacity hard reject to a warning", () => {
    const issues = validatePhysicalSanity(
      { date: "2026-05-01", vehicle_id: "v1", driver_id: "d1", onward_reading: 1000, return_reading: 1300, diesel_consumed: 150 },
      { tank_capacity: 120 },
      false,
      true
    );
    expect(issues.some((i) => i.severity === "ERROR")).toBe(false);
    const flag = issues.find((i) => i.code === "MULTI_FILLUP_FLAGGED");
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe("WARNING");
  });

  it("still hard-rejects an implausible diesel amount even with the multiple-fill-ups override", () => {
    // 120 L tank * MULTI_FILLUP_MAX_MULTIPLIER (4) = 480 L ceiling — 1000 L is not a plausible multi-fill-up.
    const issues = validatePhysicalSanity(
      { date: "2026-05-01", vehicle_id: "v1", driver_id: "d1", onward_reading: 1000, return_reading: 1300, diesel_consumed: 1000 },
      { tank_capacity: 120 },
      false,
      true
    );
    const issue = issues.find((i) => i.code === "EXCEEDS_PLAUSIBLE_MULTI_FILLUP");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("ERROR");
  });

  it("flags a mismatched multiple-fill-ups override when diesel doesn't actually exceed one tank", () => {
    const issues = validatePhysicalSanity(
      { date: "2026-05-01", vehicle_id: "v1", driver_id: "d1", onward_reading: 1000, return_reading: 1300, diesel_consumed: 40 },
      { tank_capacity: 120 },
      false,
      true
    );
    expect(issues.some((i) => i.severity === "ERROR")).toBe(false);
    expect(issues.some((i) => i.code === "MULTI_FILLUP_NOT_APPLICABLE" && i.severity === "WARNING")).toBe(true);
  });

  it("passes a physically sane entry with no issues", () => {
    const issues = validatePhysicalSanity(
      { date: "2026-05-01", vehicle_id: "v1", driver_id: "d1", onward_reading: 1000, return_reading: 1300, diesel_consumed: 40 },
      { tank_capacity: 120 }
    );
    expect(issues).toHaveLength(0);
  });

  it("evaluateEntry marks a negative-KMS entry as invalid (blocks the save)", () => {
    const driver: Driver = sampleDrivers[0];
    const evaluation = evaluateEntry({
      input: { date: "2026-05-01", vehicle_id: VEHICLE_A.id, driver_id: driver.id, onward_reading: 1000, return_reading: 900, diesel_consumed: 30 },
      vehicle: VEHICLE_A,
      driver,
      previousReturnReading: 1000,
      priorVehicleEntries: [],
    });
    expect(evaluation.isValid).toBe(false);
    expect(evaluation.issues.some((i) => i.code === "NEGATIVE_KMS" && i.severity === "ERROR")).toBe(true);
  });

  it("an odometer-rollover override bypasses the hard reject but still raises a distinct manual-review flag (not silently accepted)", () => {
    const driver: Driver = sampleDrivers[0];
    const evaluation = evaluateEntry({
      input: { date: "2026-05-01", vehicle_id: VEHICLE_A.id, driver_id: driver.id, onward_reading: 999900, return_reading: 100, diesel_consumed: 25 },
      vehicle: VEHICLE_A,
      driver,
      previousReturnReading: 999900,
      priorVehicleEntries: [],
      odometerRollover: true,
    });
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.issues.some((i) => i.code === "ODOMETER_ROLLOVER" && i.severity === "WARNING")).toBe(true);
  });

  it("a multiple-fill-ups override bypasses the tank-capacity hard reject but still raises a distinct manual-review flag (not silently accepted)", () => {
    const driver: Driver = sampleDrivers[0];
    const evaluation = evaluateEntry({
      // VEHICLE_A's tank_capacity is 100 — 150 L exceeds one tank but is a
      // plausible two-fill-up trip.
      input: { date: "2026-05-01", vehicle_id: VEHICLE_A.id, driver_id: driver.id, onward_reading: 1000, return_reading: 1300, diesel_consumed: 150 },
      vehicle: VEHICLE_A,
      driver,
      previousReturnReading: 1000,
      priorVehicleEntries: [],
      multipleFillUps: true,
    });
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.issues.some((i) => i.code === "MULTI_FILLUP_FLAGGED" && i.severity === "WARNING")).toBe(true);
  });

  it("no longer flags a small unlogged-short-trip gap once a default tolerance is configured", () => {
    const driver: Driver = sampleDrivers[0];
    const evaluation = evaluateEntry({
      // Previous return was 1000; onward is 1015 — a 15 km gap, well within
      // the 25 km default tolerance a client can now configure in Settings.
      input: { date: "2026-05-01", vehicle_id: VEHICLE_A.id, driver_id: driver.id, onward_reading: 1015, return_reading: 1300, diesel_consumed: 40 },
      vehicle: VEHICLE_A,
      driver,
      previousReturnReading: 1000,
      priorVehicleEntries: [],
      defaultGapToleranceKm: 25,
    });
    expect(evaluation.continuity.isBroken).toBe(false);
    expect(evaluation.issues.some((i) => i.code === "CONTINUITY_GAP")).toBe(false);
  });
});

// ---------------------------------------------------------------------
// §10.3 Anomaly threshold test — against realistic sample log data
// ---------------------------------------------------------------------

describe("detectAnomaly — 8% deviation threshold against realistic logged data", () => {
  it("fires on vehicle 6039's 25 Apr entry (5.69 km/l) against a 7.8 km/l baseline (~-27%)", () => {
    const result = detectAnomaly(5.69, 7.8, DEFAULT_ANOMALY_THRESHOLD_PCT);
    expect(result.isAnomalous).toBe(true);
    expect(result.direction).toBe("WORSE");
    expect(result.deviationPct).toBeCloseTo(-27.05, 1);
  });

  it("fires on 6039's 29 Apr entry (5.9 km/l) against the same baseline", () => {
    const result = detectAnomaly(5.9, 7.8, DEFAULT_ANOMALY_THRESHOLD_PCT);
    expect(result.isAnomalous).toBe(true);
    expect(result.direction).toBe("WORSE");
  });

  it("does not over-flag normal day-to-day variation within the +/-8% band around a 7.8 km/l baseline", () => {
    // 8% of 7.8 is 0.624, so the safe band is roughly 7.18-8.42 km/l.
    for (const avg of [7.85, 7.95, 8.1, 8.3, 8.4]) {
      const result = detectAnomaly(avg, 7.8, DEFAULT_ANOMALY_THRESHOLD_PCT);
      expect(result.isAnomalous).toBe(false);
    }
  });

  it("flags a better-than-baseline outlier with BETTER direction, not WORSE", () => {
    const result = detectAnomaly(9.6, 7.8, DEFAULT_ANOMALY_THRESHOLD_PCT);
    expect(result.isAnomalous).toBe(true);
    expect(result.direction).toBe("BETTER");
  });

  it("the sample log flags all three of vehicle 6039's trips WORSE", () => {
    const entries = buildSampleEntries(sampleVehicles, sampleDrivers)
      .filter((e) => e.vehicle_id === "veh-3")
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(entries.map((e) => e.date)).toEqual(["2026-04-25", "2026-04-29", "2026-05-02"]);
    expect(entries[0].average_kml).toBe(5.69);
    expect(entries[1].average_kml).toBe(5.9);
    for (const entry of entries) {
      expect(entry.is_anomalous).toBe(true);
      expect(entry.anomaly_direction).toBe("WORSE");
    }
  });

  it("computes 6039's 2 May trip purely from raw readings (283 km / 46 L = 6.15 km/l) — average is always derived, never hand-entered", () => {
    const entries = buildSampleEntries(sampleVehicles, sampleDrivers).filter((e) => e.vehicle_id === "veh-3");
    const may2 = entries.find((e) => e.date === "2026-05-02");
    expect(may2?.total_kms).toBe(283);
    expect(may2?.diesel_consumed).toBe(46);
    expect(may2?.average_kml).toBe(6.15);
  });

  it("does not flag vehicles 4417 or 8256, whose entries sit within the expected band", () => {
    const entries = buildSampleEntries(sampleVehicles, sampleDrivers).filter(
      (e) => e.vehicle_id === "veh-1" || e.vehicle_id === "veh-2"
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.is_anomalous).toBe(false);
    }
  });

  it("computeVehicleBaseline blends toward the trailing average once 10-15 entries exist", () => {
    const priorEntries = Array.from({ length: 20 }, () => ({ average_kml: 9.0, diesel_consumed: 40 }));
    const blended = computeVehicleBaseline({ expected_avg: 7.8 }, priorEntries);
    expect(blended).toBe(9.0); // fully trailing past 15 entries
  });

  it("computeVehicleBaseline establishes a baseline purely from entries when no expected_avg was set at setup", () => {
    const noBaselineVehicle: Pick<Vehicle, "expected_avg"> = { expected_avg: null };
    const priorEntries = [
      { average_kml: 9.0, diesel_consumed: 20 },
      { average_kml: 9.4, diesel_consumed: 22 },
    ];
    const baseline = computeVehicleBaseline(noBaselineVehicle, priorEntries);
    expect(baseline).toBeCloseTo(9.2, 5);
  });
});

// ---------------------------------------------------------------------
// §10.5 Audit trail test
// ---------------------------------------------------------------------

describe("Audit trail — corrections preserve original values (LocalStorage engine)", () => {
  let vehicleId: string;
  let driverId: string;

  beforeEach(async () => {
    await clearLocalData();
    const vehicle = await createVehicle({ vehicle_no: "TEST-0001", starting_odometer: 0, tank_capacity: 120 });
    const driver = await createDriver({ name: "Test Driver" });
    vehicleId = vehicle.id;
    driverId = driver.id;
  });

  it("records every correction with old/new value, who, and when — and it's actually viewable", async () => {
    const { entry } = await createEntry(
      {
        date: "2026-06-01",
        vehicle_id: vehicleId,
        driver_id: driverId,
        onward_reading: 500,
        return_reading: 800,
        diesel_consumed: 40,
      },
      { createdBy: "tester" }
    );
    expect(entry.total_kms).toBe(300);
    expect(entry.average_kml).toBe(7.5);

    const { entry: corrected } = await correctEntry(
      entry.id,
      { return_reading: 820 },
      { changedBy: "Depot Manager", reason: "Odometer misread on original log" }
    );

    expect(corrected.return_reading).toBe(820);
    expect(corrected.total_kms).toBe(320); // recomputed, not manually set
    expect(corrected.average_kml).toBe(8); // recomputed

    const logs = await listAuditLogs(entry.id);
    expect(logs.length).toBeGreaterThan(0);

    const returnReadingLog = logs.find((l) => l.field_name === "return_reading");
    expect(returnReadingLog?.old_value).toBe("800");
    expect(returnReadingLog?.new_value).toBe("820");
    expect(returnReadingLog?.changed_by).toBe("Depot Manager");
    expect(returnReadingLog?.reason).toBe("Odometer misread on original log");
    expect(returnReadingLog?.created_at).toBeTruthy();

    const kmsLog = logs.find((l) => l.field_name === "total_kms");
    expect(kmsLog?.old_value).toBe("300");
    expect(kmsLog?.new_value).toBe("320");
  });

  it("requires a reason for every correction — no silent overwrites", async () => {
    const { entry } = await createEntry(
      {
        date: "2026-06-02",
        vehicle_id: vehicleId,
        driver_id: driverId,
        onward_reading: 800,
        return_reading: 1000,
        diesel_consumed: 30,
      },
      { createdBy: "tester" }
    );

    await expect(
      correctEntry(entry.id, { diesel_consumed: 25 }, { changedBy: "Depot Manager", reason: "" })
    ).rejects.toThrow(ValidationError);
  });

  it("a correction that would violate hard sanity checks is rejected, same as a new entry", async () => {
    const { entry } = await createEntry(
      {
        date: "2026-06-03",
        vehicle_id: vehicleId,
        driver_id: driverId,
        onward_reading: 1000,
        return_reading: 1200,
        diesel_consumed: 25,
      },
      { createdBy: "tester" }
    );

    await expect(
      correctEntry(entry.id, { diesel_consumed: 500 }, { changedBy: "Depot Manager", reason: "Typo fix attempt" })
    ).rejects.toThrow(ValidationError);
  });

  it("the entry itself is append-only-in-spirit: the current row updates, but nothing is lost from the audit log", async () => {
    const { entry } = await createEntry(
      {
        date: "2026-06-04",
        vehicle_id: vehicleId,
        driver_id: driverId,
        onward_reading: 1200,
        return_reading: 1500,
        diesel_consumed: 35,
        place: "Chennai Depot",
      },
      { createdBy: "tester" }
    );

    await correctEntry(entry.id, { place: "Chennai Depot (corrected)" }, { changedBy: "A", reason: "Typo" });
    await correctEntry(entry.id, { place: "Chennai Depot Central" }, { changedBy: "B", reason: "More typo fixing" });

    const logs = await listAuditLogs(entry.id);
    const placeLogs = logs.filter((l) => l.field_name === "place");
    expect(placeLogs).toHaveLength(2);

    const allEntries = await listEntries();
    const current = allEntries.find((e) => e.id === entry.id);
    expect(current?.place).toBe("Chennai Depot Central");
  });
});

// ---------------------------------------------------------------------
// §10.6 Auth/RLS test
// ---------------------------------------------------------------------
//
// Row Level Security is enforced by Postgres itself once the client's
// Supabase project runs supabase/migrations/02_row_level_security.sql —
// that behavior requires a live Postgres instance to exercise for real
// (e.g. Supabase's own SQL editor running queries as the `anon` role) and
// isn't something a Node unit test can meaningfully fake. This test is a
// static guard that the policies actually ship in the migration rather
// than silently being dropped from a future edit.

describe("Row Level Security — migration ships lockdown policies", () => {
  it("enables RLS and restricts every table to authenticated-only access", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/02_row_level_security.sql"), "utf-8");
    for (const table of ["vehicles", "drivers", "fuel_entries", "entry_audit_logs", "settings"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    }
    expect(sql).toMatch(/auth\.role\(\) = 'authenticated'/);
  });
});

// ---------------------------------------------------------------------
// Fleet-wide aggregate helper
// ---------------------------------------------------------------------

describe("computeFleetAverage", () => {
  it("computes a diesel-weighted average, not a plain average of per-trip averages", () => {
    const entries = [
      { total_kms: 400, diesel_consumed: 50 }, // 8 km/l
      { total_kms: 100, diesel_consumed: 20 }, // 5 km/l
    ];
    // weighted: 500 km / 70 L = 7.142857...
    expect(computeFleetAverage(entries)).toBeCloseTo(7.14, 2);
  });

  it("returns null when there is no diesel data yet", () => {
    expect(computeFleetAverage([])).toBeNull();
  });
});
