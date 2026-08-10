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
}

export interface Driver {
  id: string;
  name: string;
  phone: string | null;
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

export interface Settings {
  fuel_rate_inr: number;
  anomaly_threshold_pct: number;
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

export interface ContinuityResult {
  isBroken: boolean;
  expectedOnwardReading: number | null;
  gapKms: number | null;
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
