// Core validation & anomaly detection engine.
//
// This file is the actual product: every rule here exists to catch a
// specific failure mode the client was already fighting on paper (see
// fleet-fuel-tracker-build-prompt.md §4-5). Both the client-side form
// (DailyLogForm) and the store layer (store.ts, before any Supabase/
// LocalStorage write) must run entries through `evaluateEntry` — never
// trust client-side-only validation for a save.

import type {
  AnomalyDirection,
  AnomalyResult,
  ComputedFields,
  ContinuityResult,
  Driver,
  EntryEvaluation,
  FuelEntry,
  FuelEntryInput,
  ValidationIssue,
  Vehicle,
} from "./types";

// A typical mechanical/digital odometer on a fleet truck rolls over at this
// value. Only relevant for the rare, explicit odometer-rollover override.
export const ODOMETER_ROLLOVER_THRESHOLD = 999999;

// Once a vehicle has this many real entries, its baseline starts blending
// away from the client-provided "expected average" toward its own trailing
// average. Fully replaced by FULL_TRAILING_ENTRIES. See CLAUDE.md §3.1 and
// build prompt §5 ("once ~10-15 entries exist... blend in or shift").
export const BASELINE_BLEND_START_ENTRIES = 10;
export const BASELINE_FULL_TRAILING_ENTRIES = 15;

export const DEFAULT_ANOMALY_THRESHOLD_PCT = 8.0;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

// ---------------------------------------------------------------------
// 1. Auto-computed fields — never manually editable (CLAUDE.md §1, §Code
//    Guidelines #2). Handles the rare odometer-rollover case distinctly
//    rather than folding it silently into the normal subtraction.
// ---------------------------------------------------------------------

export function computeFields(
  onwardReading: number,
  returnReading: number,
  dieselConsumed: number,
  odometerRollover = false,
  rolloverThreshold = ODOMETER_ROLLOVER_THRESHOLD
): ComputedFields {
  const total_kms =
    odometerRollover && returnReading < onwardReading
      ? rolloverThreshold - onwardReading + returnReading
      : returnReading - onwardReading;

  const average_kml = dieselConsumed > 0 ? total_kms / dieselConsumed : 0;

  return {
    total_kms: round2(total_kms),
    average_kml: round2(average_kml),
  };
}

// ---------------------------------------------------------------------
// 2. Physical sanity checks — HARD REJECT (CLAUDE.md §2 validation table)
// ---------------------------------------------------------------------

export function validatePhysicalSanity(
  input: FuelEntryInput,
  vehicle: Pick<Vehicle, "tank_capacity">,
  odometerRollover = false
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!odometerRollover && input.return_reading < input.onward_reading) {
    issues.push({
      field: "return_reading",
      severity: "ERROR",
      code: "NEGATIVE_KMS",
      message:
        "Return reading cannot be less than onward reading (negative KMS).",
    });
  }

  if (odometerRollover && input.return_reading >= input.onward_reading) {
    // The rollover checkbox was ticked but the readings don't actually
    // describe a rollover — don't silently accept a mislabeled entry.
    issues.push({
      field: "return_reading",
      severity: "WARNING",
      code: "ROLLOVER_NOT_APPLICABLE",
      message:
        "Odometer rollover was flagged but return reading is not less than onward reading — please verify.",
    });
  }

  if (odometerRollover && input.return_reading < input.onward_reading) {
    issues.push({
      field: "return_reading",
      severity: "WARNING",
      code: "ODOMETER_ROLLOVER",
      message:
        "Odometer rollover manually flagged — KMS computed across rollover. Please verify before confirming.",
    });
  }

  if (input.diesel_consumed > vehicle.tank_capacity) {
    issues.push({
      field: "diesel_consumed",
      severity: "ERROR",
      code: "EXCEEDS_TANK_CAPACITY",
      message: `Diesel consumed exceeds vehicle tank capacity (${vehicle.tank_capacity} Litres).`,
    });
  }

  if (input.diesel_consumed <= 0) {
    issues.push({
      field: "diesel_consumed",
      severity: "ERROR",
      code: "INVALID_DIESEL_AMOUNT",
      message: "Diesel consumed must be greater than zero.",
    });
  }

  if (input.onward_reading < 0 || input.return_reading < 0) {
    issues.push({
      field: "onward_reading",
      severity: "ERROR",
      code: "NEGATIVE_READING",
      message: "Odometer readings cannot be negative.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------
// Required-field / shape validation — cheap to check but must run
// server-side too, since a client-only check can be bypassed.
// ---------------------------------------------------------------------

export function validateRequiredFields(input: FuelEntryInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.date) {
    issues.push({ field: "date", severity: "ERROR", code: "REQUIRED", message: "Date is required." });
  }
  if (!input.vehicle_id) {
    issues.push({ field: "vehicle_id", severity: "ERROR", code: "REQUIRED", message: "Vehicle is required." });
  }
  if (!input.driver_id) {
    issues.push({ field: "driver_id", severity: "ERROR", code: "REQUIRED", message: "Driver is required." });
  }
  if (input.onward_reading == null || Number.isNaN(input.onward_reading)) {
    issues.push({
      field: "onward_reading",
      severity: "ERROR",
      code: "REQUIRED",
      message: "Onward reading is required.",
    });
  }
  if (input.return_reading == null || Number.isNaN(input.return_reading)) {
    issues.push({
      field: "return_reading",
      severity: "ERROR",
      code: "REQUIRED",
      message: "Return reading is required.",
    });
  }
  if (input.diesel_consumed == null || Number.isNaN(input.diesel_consumed)) {
    issues.push({
      field: "diesel_consumed",
      severity: "ERROR",
      code: "REQUIRED",
      message: "Diesel consumed is required.",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------
// 3. Odometer continuity check — SOFT FLAG (CLAUDE.md §2)
// ---------------------------------------------------------------------

export function checkContinuity(
  onwardReading: number,
  previousReturnReading: number | null
): ContinuityResult {
  if (previousReturnReading == null) {
    // First entry ever logged for this vehicle — nothing to compare against.
    return { isBroken: false, expectedOnwardReading: null, gapKms: null };
  }

  const isBroken = onwardReading !== previousReturnReading;

  return {
    isBroken,
    expectedOnwardReading: previousReturnReading,
    gapKms: isBroken ? round2(onwardReading - previousReturnReading) : 0,
  };
}

export function continuityIssue(result: ContinuityResult): ValidationIssue | null {
  if (!result.isBroken || result.expectedOnwardReading == null) return null;
  return {
    field: "onward_reading",
    severity: "WARNING",
    code: "CONTINUITY_GAP",
    message: `Odometer gap detected! Expected onward reading of ${result.expectedOnwardReading} km based on previous trip's return reading.`,
  };
}

// ---------------------------------------------------------------------
// 4. Baseline maintenance (CLAUDE.md §3.1)
// ---------------------------------------------------------------------

/**
 * Blends the vehicle's client-provided "expected average" into its own
 * trailing average as real entries accumulate. Below
 * BASELINE_BLEND_START_ENTRIES, the expected average (if any) is used
 * as-is. Above BASELINE_FULL_TRAILING_ENTRIES, the trailing average fully
 * replaces it. In between, linearly blend the two. If no expected average
 * was ever set, fall back to the trailing average from the first entry
 * onward (there is nothing else to seed it with).
 */
export function computeVehicleBaseline(
  vehicle: Pick<Vehicle, "expected_avg">,
  priorEntries: Pick<FuelEntry, "average_kml" | "diesel_consumed">[]
): number | null {
  const validEntries = priorEntries.filter((e) => e.diesel_consumed > 0);
  const n = validEntries.length;
  const trailingAvg = average(validEntries.map((e) => e.average_kml));

  if (vehicle.expected_avg == null) {
    return trailingAvg == null ? null : round2(trailingAvg);
  }

  if (n < BASELINE_BLEND_START_ENTRIES || trailingAvg == null) {
    return round2(vehicle.expected_avg);
  }

  if (n >= BASELINE_FULL_TRAILING_ENTRIES) {
    return round2(trailingAvg);
  }

  const blendFactor =
    (n - BASELINE_BLEND_START_ENTRIES) /
    (BASELINE_FULL_TRAILING_ENTRIES - BASELINE_BLEND_START_ENTRIES);
  const blended = vehicle.expected_avg * (1 - blendFactor) + trailingAvg * blendFactor;
  return round2(blended);
}

/** Simple trailing average of a driver's own entries — no seed value exists for drivers. */
export function computeDriverBaseline(
  priorEntries: Pick<FuelEntry, "average_kml" | "diesel_consumed">[]
): number | null {
  const validEntries = priorEntries.filter((e) => e.diesel_consumed > 0);
  const avg = average(validEntries.map((e) => e.average_kml));
  return avg == null ? null : round2(avg);
}

// ---------------------------------------------------------------------
// 5. Anomaly detection (CLAUDE.md §2 & §3.2)
// ---------------------------------------------------------------------

export function detectAnomaly(
  averageKml: number,
  baseline: number | null,
  thresholdPct: number = DEFAULT_ANOMALY_THRESHOLD_PCT
): AnomalyResult {
  if (baseline == null || baseline <= 0) {
    return { isAnomalous: false, direction: null, deviationPct: null, baselineUsed: baseline };
  }

  const deviationPct = ((averageKml - baseline) / baseline) * 100;
  const isAnomalous = Math.abs(deviationPct) > thresholdPct;
  const direction: AnomalyDirection = !isAnomalous ? null : deviationPct < 0 ? "WORSE" : "BETTER";

  return {
    isAnomalous,
    direction,
    deviationPct: round2(deviationPct),
    baselineUsed: baseline,
  };
}

export function anomalyIssue(result: AnomalyResult, vehicleNo?: string): ValidationIssue | null {
  if (!result.isAnomalous || result.deviationPct == null || result.baselineUsed == null) return null;
  const pct = Math.abs(result.deviationPct).toFixed(1);
  const label = result.direction === "WORSE" ? "worse than" : "better than";
  return {
    field: "diesel_consumed",
    severity: "WARNING",
    code: "ANOMALY_DEVIATION",
    message: `Average deviates ${pct}% ${label} ${vehicleNo ? `${vehicleNo}'s` : "the"} baseline of ${result.baselineUsed} km/l.`,
  };
}

// ---------------------------------------------------------------------
// 6. Full entry evaluation — the single entry point both the form and the
//    store should call before accepting a create or a correction.
// ---------------------------------------------------------------------

export interface EvaluateEntryOptions {
  input: FuelEntryInput;
  vehicle: Vehicle;
  driver: Driver;
  previousReturnReading: number | null;
  priorVehicleEntries: Pick<FuelEntry, "average_kml" | "diesel_consumed">[];
  anomalyThresholdPct?: number;
  odometerRollover?: boolean;
}

export function evaluateEntry(opts: EvaluateEntryOptions): EntryEvaluation {
  const {
    input,
    vehicle,
    previousReturnReading,
    priorVehicleEntries,
    anomalyThresholdPct = DEFAULT_ANOMALY_THRESHOLD_PCT,
    odometerRollover = false,
  } = opts;

  const issues: ValidationIssue[] = [
    ...validateRequiredFields(input),
    ...validatePhysicalSanity(input, vehicle, odometerRollover),
  ];

  const hasBlockingError = issues.some((i) => i.severity === "ERROR");

  const computed = hasBlockingError
    ? { total_kms: 0, average_kml: 0 }
    : computeFields(input.onward_reading, input.return_reading, input.diesel_consumed, odometerRollover);

  const continuity = checkContinuity(input.onward_reading, previousReturnReading);
  const cIssue = continuityIssue(continuity);
  if (cIssue) issues.push(cIssue);

  const baseline = computeVehicleBaseline(vehicle, priorVehicleEntries);
  const anomaly = hasBlockingError
    ? { isAnomalous: false, direction: null, deviationPct: null, baselineUsed: baseline }
    : detectAnomaly(computed.average_kml, baseline, anomalyThresholdPct);
  const aIssue = anomalyIssue(anomaly, vehicle.vehicle_no);
  if (aIssue) issues.push(aIssue);

  return {
    computed,
    continuity,
    anomaly,
    issues,
    isValid: !hasBlockingError,
  };
}

// ---------------------------------------------------------------------
// Fleet/driver aggregate helpers used by the dashboard & drivers pages
// ---------------------------------------------------------------------

export function computeFleetAverage(entries: Pick<FuelEntry, "total_kms" | "diesel_consumed">[]): number | null {
  const totalKms = entries.reduce((sum, e) => sum + e.total_kms, 0);
  const totalDiesel = entries.reduce((sum, e) => sum + e.diesel_consumed, 0);
  if (totalDiesel <= 0) return null;
  return round2(totalKms / totalDiesel);
}

// ---------------------------------------------------------------------
// Trend series builders — for BaselineTrendChart. Recomputes the baseline
// that was in effect at each point in the vehicle/driver's own entry
// sequence (the DB only persists the resulting flag, not the baseline
// value itself), so the shaded expected-range band matches exactly what
// originally triggered each flag.
// ---------------------------------------------------------------------

export interface TrendPoint {
  id: string;
  date: string;
  label: string;
  average: number;
  baseline: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  isAnomalous: boolean;
  direction: AnomalyDirection;
}

export function buildVehicleTrend(
  vehicle: Pick<Vehicle, "expected_avg">,
  entriesSorted: Pick<FuelEntry, "id" | "date" | "place" | "average_kml" | "diesel_consumed">[],
  thresholdPct: number = DEFAULT_ANOMALY_THRESHOLD_PCT
): TrendPoint[] {
  return entriesSorted.map((entry, idx) => {
    const prior = entriesSorted.slice(0, idx);
    const baseline = computeVehicleBaseline(vehicle, prior);
    const anomaly = detectAnomaly(entry.average_kml, baseline, thresholdPct);
    return {
      id: entry.id,
      date: entry.date,
      label: entry.place || entry.date,
      average: entry.average_kml,
      baseline,
      lowerBound: baseline != null ? round2(baseline * (1 - thresholdPct / 100)) : null,
      upperBound: baseline != null ? round2(baseline * (1 + thresholdPct / 100)) : null,
      isAnomalous: anomaly.isAnomalous,
      direction: anomaly.direction,
    };
  });
}

export function buildDriverTrend(
  entriesSorted: Pick<FuelEntry, "id" | "date" | "place" | "average_kml" | "diesel_consumed">[],
  thresholdPct: number = DEFAULT_ANOMALY_THRESHOLD_PCT
): TrendPoint[] {
  return entriesSorted.map((entry, idx) => {
    const prior = entriesSorted.slice(0, idx);
    const baseline = computeDriverBaseline(prior);
    const anomaly = detectAnomaly(entry.average_kml, baseline, thresholdPct);
    return {
      id: entry.id,
      date: entry.date,
      label: entry.place || entry.date,
      average: entry.average_kml,
      baseline,
      lowerBound: baseline != null ? round2(baseline * (1 - thresholdPct / 100)) : null,
      upperBound: baseline != null ? round2(baseline * (1 + thresholdPct / 100)) : null,
      isAnomalous: anomaly.isAnomalous,
      direction: anomaly.direction,
    };
  });
}
