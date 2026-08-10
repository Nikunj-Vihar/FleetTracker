// Comprehensive unit test suite for the validation & anomaly detection
// engine — the actual product per CLAUDE.md. Mirrors the six integrity
// checks demanded by fleet-fuel-tracker-build-prompt.md §10.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ANOMALY_THRESHOLD_PCT,
  checkContinuity,
  computeFields,
  computeFleetAverage,
  computeVehicleBaseline,
  detectAnomaly,
  evaluateEntry,
  validatePhysicalSanity,
} from "@/lib/validation";
import { buildSampleEntries, sampleDrivers, sampleVehicles } from "@/lib/mockData";
import { clearLocalData, correctEntry, createEntry, createVehicle, createDriver, listAuditLogs, listEntries, ValidationError } from "@/lib/store";
import type { Driver, FuelEntryInput, Vehicle } from "@/lib/types";

const VEHICLE_2392: Vehicle = sampleVehicles[0]; // expected_avg 7.8, tank_capacity 100

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
      input: { date: "2026-05-01", vehicle_id: VEHICLE_2392.id, driver_id: driver.id, onward_reading: 1000, return_reading: 900, diesel_consumed: 30 },
      vehicle: VEHICLE_2392,
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
      input: { date: "2026-05-01", vehicle_id: VEHICLE_2392.id, driver_id: driver.id, onward_reading: 999900, return_reading: 100, diesel_consumed: 25 },
      vehicle: VEHICLE_2392,
      driver,
      previousReturnReading: 999900,
      priorVehicleEntries: [],
      odometerRollover: true,
    });
    expect(evaluation.isValid).toBe(true);
    expect(evaluation.issues.some((i) => i.code === "ODOMETER_ROLLOVER" && i.severity === "WARNING")).toBe(true);
  });
});

// ---------------------------------------------------------------------
// §10.3 Anomaly threshold test — against the client's own sample log data
// ---------------------------------------------------------------------

describe("detectAnomaly — 8% deviation threshold against the client's real logged data", () => {
  it("fires on vehicle 5809's 25 Apr entry (5.51 km/l) against a 7.8 km/l baseline — the exact entry circled in red on the client's own paper log (~-29%)", () => {
    const result = detectAnomaly(5.51, 7.8, DEFAULT_ANOMALY_THRESHOLD_PCT);
    expect(result.isAnomalous).toBe(true);
    expect(result.direction).toBe("WORSE");
    expect(result.deviationPct).toBeCloseTo(-29.36, 1);
  });

  it("fires on 5809's 29 Apr entry (5.66 km/l) against the same baseline", () => {
    const result = detectAnomaly(5.66, 7.8, DEFAULT_ANOMALY_THRESHOLD_PCT);
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

  it("the real sample log flags all three of vehicle 5809's trips WORSE, matching the client's own red-ink flag", () => {
    const entries = buildSampleEntries(sampleVehicles, sampleDrivers)
      .filter((e) => e.vehicle_id === "veh-5809")
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(entries.map((e) => e.date)).toEqual(["2026-04-25", "2026-04-29", "2026-05-02"]);
    expect(entries[0].average_kml).toBe(5.51);
    expect(entries[1].average_kml).toBe(5.66);
    for (const entry of entries) {
      expect(entry.is_anomalous).toBe(true);
      expect(entry.anomaly_direction).toBe("WORSE");
    }
  });

  it("computes 5809's 2 May trip at 6.2 km/l, correcting the client's own hand-written 5.64 — exactly the arithmetic-slip class of bug this tool exists to catch", () => {
    const entries = buildSampleEntries(sampleVehicles, sampleDrivers).filter((e) => e.vehicle_id === "veh-5809");
    const may2 = entries.find((e) => e.date === "2026-05-02");
    expect(may2?.total_kms).toBe(254);
    expect(may2?.diesel_consumed).toBe(41);
    expect(may2?.average_kml).toBe(6.2); // 254 / 41, not the paper's hand-calculated 5.64
  });

  it("does not flag vehicles 2392 or 7326, whose real entries sit within the expected band", () => {
    const entries = buildSampleEntries(sampleVehicles, sampleDrivers).filter(
      (e) => e.vehicle_id === "veh-2392" || e.vehicle_id === "veh-7326"
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
