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
  GarageExpenseInput,
  ValidationIssue,
  Vehicle,
} from "./types";

// Fallback only reachable via direct API use — the form always requires an
// explicit category pick from src/lib/maintenance.ts's fixed list.
export const DEFAULT_EXPENSE_CATEGORY = "Other";

// A typical mechanical/digital odometer on a fleet truck rolls over at this
// value. Only relevant for the rare, explicit odometer-rollover override.
export const ODOMETER_ROLLOVER_THRESHOLD = 999999;

// A long-haul trip can legitimately top up more than once, so the
// multi-fill-up override raises the ceiling rather than removing it —
// this bounds how many "tanks" one trip can plausibly account for, so a
// typo (an extra zero) still gets caught even with the box ticked.
export const MULTI_FILLUP_MAX_MULTIPLIER = 4;

// A generic starting point for the odometer-continuity tolerance, used only
// until a vehicle has enough of its own history to learn a better one (see
// computeVehicleGapTolerance below) — editable per org in Settings, same as
// the anomaly threshold.
export const DEFAULT_GAP_TOLERANCE_KM = 25;

// How far past tolerance a gap has to be before it escalates from a quiet,
// low-visibility note to a prominent warning. Keeps the check from being a
// hard cliff where "tolerance + 1 km" looks exactly as alarming as
// "tolerance + 500 km."
export const CONTINUITY_ESCALATION_MULTIPLIER = 3;

// The percentile of a vehicle's own historical (positive) gaps used as its
// learned tolerance — high enough to cover its normal range of unlogged
// short trips without being pulled up by one unusually large outlier gap.
export const CONTINUITY_TOLERANCE_PERCENTILE = 0.9;

// Below this many historical gap samples, there's not enough signal to
// trust a learned percentile over the generic default.
export const MIN_GAP_SAMPLES = 3;

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

// Nearest-rank percentile over an already-ascending-sorted array.
function percentileOf(sortedAsc: number[], p: number): number {
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(p * sortedAsc.length) - 1));
  return sortedAsc[idx];
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
  odometerRollover = false,
  multipleFillUps = false
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

  if (!multipleFillUps && input.diesel_consumed > vehicle.tank_capacity) {
    issues.push({
      field: "diesel_consumed",
      severity: "ERROR",
      code: "EXCEEDS_TANK_CAPACITY",
      message: `Diesel consumed exceeds vehicle tank capacity (${vehicle.tank_capacity} Litres). If the vehicle was refueled more than once on this trip, tick the box below.`,
    });
  }

  if (multipleFillUps && input.diesel_consumed <= vehicle.tank_capacity) {
    // The override was ticked but the number entered doesn't actually need
    // it — same "don't silently accept a mislabeled entry" spirit as the
    // rollover-not-applicable check above.
    issues.push({
      field: "diesel_consumed",
      severity: "WARNING",
      code: "MULTI_FILLUP_NOT_APPLICABLE",
      message: "Multiple fill-ups was flagged but diesel consumed doesn't exceed one tank — please verify.",
    });
  }

  if (multipleFillUps && input.diesel_consumed > vehicle.tank_capacity) {
    const maxPlausible = vehicle.tank_capacity * MULTI_FILLUP_MAX_MULTIPLIER;
    if (input.diesel_consumed > maxPlausible) {
      issues.push({
        field: "diesel_consumed",
        severity: "ERROR",
        code: "EXCEEDS_PLAUSIBLE_MULTI_FILLUP",
        message: `Diesel consumed (${input.diesel_consumed} L) is implausibly high even across multiple fill-ups for this vehicle's ${vehicle.tank_capacity} L tank. Please verify the reading.`,
      });
    } else {
      issues.push({
        field: "diesel_consumed",
        severity: "WARNING",
        code: "MULTI_FILLUP_FLAGGED",
        message: `Diesel consumed exceeds one tank's capacity (${vehicle.tank_capacity} L) — flagged as a multi-fill-up trip. Please verify before confirming.`,
      });
    }
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

// Learns this vehicle's own typical "unlogged running between trips" size
// from its history, blending away from the client-provided generic default
// the same way computeVehicleBaseline blends km/l (CLAUDE.md §3.1) — a
// city-delivery truck and a long-haul truck have very different normal gap
// sizes, and there's no single flat number that's honest for both without
// per-vehicle data.
export function computeVehicleGapTolerance(
  priorEntriesChronological: Pick<FuelEntry, "onward_reading" | "return_reading">[],
  startingOdometer: number,
  defaultToleranceKm: number
): number {
  const gaps: number[] = [];
  let previousReturn = startingOdometer;
  for (const entry of priorEntriesChronological) {
    const gap = entry.onward_reading - previousReturn;
    if (gap > 0) gaps.push(gap); // only forward gaps look like "an unlogged short trip happened"
    previousReturn = entry.return_reading;
  }

  const n = priorEntriesChronological.length;
  if (gaps.length < MIN_GAP_SAMPLES || n < BASELINE_BLEND_START_ENTRIES) return defaultToleranceKm;

  gaps.sort((a, b) => a - b);
  const learned = percentileOf(gaps, CONTINUITY_TOLERANCE_PERCENTILE);

  if (n >= BASELINE_FULL_TRAILING_ENTRIES) return round2(learned);

  const blendFactor =
    (n - BASELINE_BLEND_START_ENTRIES) / (BASELINE_FULL_TRAILING_ENTRIES - BASELINE_BLEND_START_ENTRIES);
  return round2(defaultToleranceKm * (1 - blendFactor) + learned * blendFactor);
}

// A negative gap (this trip's onward reading is LESS than the last logged
// return) never fits the "unlogged short trip" story — that only ever
// produces a forward gap — so it's never tolerated regardless of size; it's
// a data problem (wrong vehicle, entries out of order, a typo).
export function classifyGapSeverity(gapKms: number, toleranceKm: number): "NONE" | "INFO" | "WARNING" {
  if (gapKms < 0) return "WARNING";
  if (gapKms <= toleranceKm) return "NONE";
  if (toleranceKm > 0 && gapKms <= toleranceKm * CONTINUITY_ESCALATION_MULTIPLIER) return "INFO";
  return "WARNING";
}

export function checkContinuity(
  onwardReading: number,
  previousReturnReading: number | null,
  toleranceKm = 0
): ContinuityResult {
  if (previousReturnReading == null) {
    // First entry ever logged for this vehicle — nothing to compare against.
    return { isBroken: false, expectedOnwardReading: null, gapKms: null, severity: null, toleranceKm: null };
  }

  const gap = round2(onwardReading - previousReturnReading);
  const severity = classifyGapSeverity(gap, toleranceKm);
  const isBroken = severity !== "NONE";

  return {
    isBroken,
    expectedOnwardReading: previousReturnReading,
    gapKms: isBroken ? gap : 0,
    severity: isBroken ? severity : null,
    toleranceKm,
  };
}

export function continuityIssue(result: ContinuityResult): ValidationIssue | null {
  if (!result.isBroken || result.expectedOnwardReading == null || !result.severity) return null;
  const toleranceNote =
    result.toleranceKm != null && result.toleranceKm > 0 ? ` (tolerance ${result.toleranceKm} km)` : "";
  return {
    field: "onward_reading",
    severity: result.severity,
    code: "CONTINUITY_GAP",
    message: `Odometer gap detected! Expected onward reading of ${result.expectedOnwardReading} km based on previous trip's return reading${toleranceNote}.`,
  };
}

// Re-derives the gap/severity for already-created entries, for list and
// dashboard views — reuses the exact same tolerance-learning and
// classification the entry-creation path used, rather than a second,
// possibly-drifting implementation. Only annotates entries the creation
// path already marked is_continuity_broken; a single learned tolerance per
// vehicle (from its full current history) is used for the whole pass.
export function annotateContinuitySeverity(
  entries: Pick<FuelEntry, "id" | "vehicle_id" | "onward_reading" | "return_reading" | "created_at" | "is_continuity_broken">[],
  vehicles: Pick<Vehicle, "id" | "starting_odometer">[],
  defaultGapToleranceKm: number
): Map<string, "INFO" | "WARNING"> {
  const result = new Map<string, "INFO" | "WARNING">();
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const byVehicle = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byVehicle.get(entry.vehicle_id) ?? [];
    list.push(entry);
    byVehicle.set(entry.vehicle_id, list);
  }

  byVehicle.forEach((list, vehicleId) => {
    const vehicle = vehicleMap.get(vehicleId);
    if (!vehicle) return;
    const sorted = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const tolerance = computeVehicleGapTolerance(sorted, vehicle.starting_odometer, defaultGapToleranceKm);

    let previousReturn = vehicle.starting_odometer;
    for (const entry of sorted) {
      if (entry.is_continuity_broken) {
        const gap = round2(entry.onward_reading - previousReturn);
        const severity = classifyGapSeverity(gap, tolerance);
        if (severity !== "NONE") result.set(entry.id, severity);
      }
      previousReturn = entry.return_reading;
    }
  });

  return result;
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
  priorVehicleEntries: Pick<FuelEntry, "average_kml" | "diesel_consumed" | "onward_reading" | "return_reading">[];
  anomalyThresholdPct?: number;
  odometerRollover?: boolean;
  multipleFillUps?: boolean;
  defaultGapToleranceKm?: number;
}

export function evaluateEntry(opts: EvaluateEntryOptions): EntryEvaluation {
  const {
    input,
    vehicle,
    previousReturnReading,
    priorVehicleEntries,
    anomalyThresholdPct = DEFAULT_ANOMALY_THRESHOLD_PCT,
    odometerRollover = false,
    multipleFillUps = false,
    defaultGapToleranceKm = DEFAULT_GAP_TOLERANCE_KM,
  } = opts;

  const issues: ValidationIssue[] = [
    ...validateRequiredFields(input),
    ...validatePhysicalSanity(input, vehicle, odometerRollover, multipleFillUps),
  ];

  const hasBlockingError = issues.some((i) => i.severity === "ERROR");

  const computed = hasBlockingError
    ? { total_kms: 0, average_kml: 0 }
    : computeFields(input.onward_reading, input.return_reading, input.diesel_consumed, odometerRollover);

  const gapTolerance = computeVehicleGapTolerance(priorVehicleEntries, vehicle.starting_odometer, defaultGapToleranceKm);
  const continuity = checkContinuity(input.onward_reading, previousReturnReading, gapTolerance);
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
// Garage / maintenance expenses — lighter validation than fuel entries:
// there's no continuity or baseline concept for a maintenance bill, just
// required-field and sanity checks.
// ---------------------------------------------------------------------

export function validateGarageExpense(input: GarageExpenseInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.date) {
    issues.push({ field: "date", severity: "ERROR", code: "REQUIRED", message: "Date is required." });
  }
  if (!input.vehicle_id) {
    issues.push({ field: "vehicle_id", severity: "ERROR", code: "REQUIRED", message: "Vehicle is required." });
  }
  if (!input.work_description?.trim()) {
    issues.push({
      field: "work_description",
      severity: "ERROR",
      code: "REQUIRED",
      message: "A description of the work done is required.",
    });
  }
  if (!input.category?.trim()) {
    issues.push({
      field: "category",
      severity: "ERROR",
      code: "REQUIRED",
      message: "Please select a category for this expense.",
    });
  }
  if (input.amount == null || Number.isNaN(input.amount) || input.amount <= 0) {
    issues.push({
      field: "amount",
      severity: "ERROR",
      code: "INVALID_AMOUNT",
      message: "Amount must be greater than zero.",
    });
  }
  if (input.odometer_reading != null && input.odometer_reading < 0) {
    issues.push({
      field: "odometer_reading",
      severity: "ERROR",
      code: "NEGATIVE_READING",
      message: "Odometer reading cannot be negative.",
    });
  }

  return issues;
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
