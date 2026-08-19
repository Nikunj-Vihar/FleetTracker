// Core domain types for the Fleet Fuel Log & Anomaly Tracker.
// Mirrors supabase/migrations/01_initial_schema.sql field-for-field so the
// Supabase-backed store and the LocalStorage fallback store can share types.

export interface Vehicle {
  id: string;
  vehicle_no: string;
  model: string | null;
  starting_odometer: number;
  expected_avg: number | null; // Baseline km/l set at setup; null until established
  tank_capacity: number;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
}

export interface VehicleAuditLogRecord {
  id: string;
  entry_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface DriverAuditLogRecord {
  id: string;
  entry_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export type AnomalyDirection = "WORSE" | "BETTER" | null;

export interface FuelEntry {
  id: string;
  date: string; // ISO date string, e.g. "2026-08-10"
  place: string | null;
  vehicle_id: string;
  driver_id: string;
  onward_reading: number;
  return_reading: number;
  total_kms: number; // always derived, never user-editable
  diesel_consumed: number;
  average_kml: number; // always derived, never user-editable
  is_continuity_broken: boolean;
  is_anomalous: boolean;
  anomaly_direction: AnomalyDirection;
  anomaly_deviation_pct: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRecord {
  id: string;
  entry_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

// One entry per category with an alertable service interval — either can
// be null to disable that half of the check (e.g. tyres wear by distance
// only, batteries degrade on a calendar regardless of distance driven).
export interface MaintenanceInterval {
  km: number | null;
  months: number | null;
}

export type MaintenanceIntervals = Record<string, MaintenanceInterval>;

export interface Settings {
  fuel_rate_inr: number;
  anomaly_threshold_pct: number;
  maintenance_intervals: MaintenanceIntervals;
  continuity_gap_tolerance_km: number;
}

// --- Garage / maintenance expenses --------------------------------------
// Mirrors FuelEntry's shape: anchored to vehicle_id (UUID), never the
// plate string, with the same append-only correction pattern via
// GarageExpenseAuditLogRecord instead of silent overwrites.

export interface Garage {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export interface GarageExpense {
  id: string;
  date: string;
  vehicle_id: string;
  odometer_reading: number | null;
  work_description: string;
  garage_id: string | null;
  bill_no: string | null;
  amount: number;
  category: string;
  is_paid: boolean;
  paid_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GarageExpenseAuditLogRecord {
  id: string;
  entry_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

// --- Input / form shapes -----------------------------------------------

// Fields captured directly from the entry form. Total KMS and Average km/l
// are intentionally excluded — they are always computed, never entered.
export interface FuelEntryInput {
  date: string;
  place?: string | null;
  vehicle_id: string;
  driver_id: string;
  onward_reading: number;
  return_reading: number;
  diesel_consumed: number;
  notes?: string | null;
}

export interface VehicleInput {
  vehicle_no: string;
  model?: string | null;
  starting_odometer: number;
  expected_avg?: number | null;
  tank_capacity: number;
}

export interface DriverInput {
  name: string;
  phone?: string | null;
}

export interface GarageInput {
  name: string;
  phone?: string | null;
}

// odometer_reading and bill_no are frequently unknown/skipped on the paper
// ledger (a garage visit doesn't always come with a formal invoice), so
// both stay optional rather than required.
export interface GarageExpenseInput {
  date: string;
  vehicle_id: string;
  odometer_reading?: number | null;
  work_description: string;
  garage_id?: string | null;
  bill_no?: string | null;
  amount: number;
  category: string;
  is_paid?: boolean;
  paid_date?: string | null;
  notes?: string | null;
}

// --- Validation / anomaly engine result shapes --------------------------

export type ValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface ValidationIssue {
  field: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
}

export interface ComputedFields {
  total_kms: number;
  average_kml: number;
}

export type ContinuitySeverity = "INFO" | "WARNING" | null;

export interface ContinuityResult {
  isBroken: boolean;
  expectedOnwardReading: number | null;
  gapKms: number | null;
  severity: ContinuitySeverity;
  toleranceKm: number | null;
}

export interface AnomalyResult {
  isAnomalous: boolean;
  direction: AnomalyDirection;
  deviationPct: number | null; // signed: negative = worse, positive = better
  baselineUsed: number | null;
}

export interface EntryEvaluation {
  computed: ComputedFields;
  continuity: ContinuityResult;
  anomaly: AnomalyResult;
  issues: ValidationIssue[]; // ERROR entries mean the entry must be rejected
  isValid: boolean; // false if any ERROR-severity issue is present
}

export type FlagSeverityRank = "HIGH" | "MEDIUM" | "LOW";

export interface FlaggedEntry {
  entry: FuelEntry;
  vehicle: Vehicle | undefined;
  driver: Driver | undefined;
  reasons: string[];
  severityRank: FlagSeverityRank;
}
