// State management: Supabase-backed when configured, LocalStorage-backed
// otherwise (CLAUDE.md "Offline Resilience"). Every function in this file
// is the single write path for its entity — pages/components should never
// touch localStorage or the supabase client directly, so validation stays
// centralized (Code Guidelines #1, #3).

import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import { DEFAULT_EXPENSE_CATEGORY, evaluateEntry, validateGarageExpense } from "./validation";
import type {
  AuditLogRecord,
  Driver,
  DriverInput,
  EntryEvaluation,
  FuelEntry,
  FuelEntryInput,
  Garage,
  GarageExpense,
  GarageExpenseAuditLogRecord,
  GarageExpenseInput,
  GarageInput,
  Settings,
  ValidationIssue,
  Vehicle,
  VehicleInput,
} from "./types";

export class ValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(issues.map((i) => i.message).join(" ") || "Validation failed.");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---------------------------------------------------------------------
// LocalStorage engine
// ---------------------------------------------------------------------

const LS_KEYS = {
  vehicles: "fleettracker.vehicles",
  drivers: "fleettracker.drivers",
  entries: "fleettracker.entries",
  audit: "fleettracker.audit",
  settings: "fleettracker.settings",
  seeded: "fleettracker.seeded",
  garages: "fleettracker.garages",
  garageExpenses: "fleettracker.garageExpenses",
  garageExpenseAudit: "fleettracker.garageExpenseAudit",
};

const DEFAULT_SETTINGS: Settings = { fuel_rate_inr: 95.5, anomaly_threshold_pct: 8.0 };

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------

export async function listVehicles(): Promise<Vehicle[]> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client.from("vehicles").select("*").order("vehicle_no");
    if (error) throw new Error(error.message);
    return data as Vehicle[];
  }
  return lsGet<Vehicle[]>(LS_KEYS.vehicles, []).sort((a, b) => a.vehicle_no.localeCompare(b.vehicle_no));
}

export async function getVehicleById(id: string): Promise<Vehicle | null> {
  const vehicles = await listVehicles();
  return vehicles.find((v) => v.id === id) ?? null;
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  if (!input.vehicle_no?.trim()) {
    throw new ValidationError([
      { field: "vehicle_no", severity: "ERROR", code: "REQUIRED", message: "Vehicle number is required." },
    ]);
  }
  const existing = await listVehicles();
  if (existing.some((v) => v.vehicle_no.toLowerCase() === input.vehicle_no.trim().toLowerCase())) {
    throw new ValidationError([
      { field: "vehicle_no", severity: "ERROR", code: "DUPLICATE", message: "A vehicle with this number already exists." },
    ]);
  }

  const record: Vehicle = {
    id: newId(),
    vehicle_no: input.vehicle_no.trim(),
    model: input.model?.trim() || null,
    starting_odometer: input.starting_odometer ?? 0,
    expected_avg: input.expected_avg ?? null,
    tank_capacity: input.tank_capacity ?? 300,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("vehicles")
      .insert({
        vehicle_no: record.vehicle_no,
        model: record.model,
        starting_odometer: record.starting_odometer,
        expected_avg: record.expected_avg,
        tank_capacity: record.tank_capacity,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Vehicle;
  }

  const vehicles = lsGet<Vehicle[]>(LS_KEYS.vehicles, []);
  vehicles.push(record);
  lsSet(LS_KEYS.vehicles, vehicles);
  return record;
}

// Baseline/tank-capacity configuration edits. Not routed through the
// entry_audit_logs table — that table's FK targets fuel_entries only, per
// the append-only requirement being specific to trip entries themselves
// (CLAUDE.md §4). Vehicle master-data edits are plain updates.
export async function updateVehicle(id: string, changes: Partial<VehicleInput>): Promise<Vehicle> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client.from("vehicles").update(changes).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as Vehicle;
  }

  const vehicles = lsGet<Vehicle[]>(LS_KEYS.vehicles, []);
  const idx = vehicles.findIndex((v) => v.id === id);
  if (idx < 0) throw new Error("Vehicle not found.");
  vehicles[idx] = { ...vehicles[idx], ...changes };
  lsSet(LS_KEYS.vehicles, vehicles);
  return vehicles[idx];
}

// ---------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------

export async function listDrivers(): Promise<Driver[]> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client.from("drivers").select("*").order("name");
    if (error) throw new Error(error.message);
    return data as Driver[];
  }
  return lsGet<Driver[]>(LS_KEYS.drivers, []).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getDriverById(id: string): Promise<Driver | null> {
  const drivers = await listDrivers();
  return drivers.find((d) => d.id === id) ?? null;
}

export async function createDriver(input: DriverInput): Promise<Driver> {
  if (!input.name?.trim()) {
    throw new ValidationError([
      { field: "name", severity: "ERROR", code: "REQUIRED", message: "Driver name is required." },
    ]);
  }

  const record: Driver = {
    id: newId(),
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("drivers")
      .insert({ name: record.name, phone: record.phone })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Driver;
  }

  const drivers = lsGet<Driver[]>(LS_KEYS.drivers, []);
  drivers.push(record);
  lsSet(LS_KEYS.drivers, drivers);
  return record;
}

// ---------------------------------------------------------------------
// Fuel entries
// ---------------------------------------------------------------------

export async function listEntries(): Promise<FuelEntry[]> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("fuel_entries")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data as FuelEntry[];
  }
  return [...lsGet<FuelEntry[]>(LS_KEYS.entries, [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getEntryById(id: string): Promise<FuelEntry | null> {
  const entries = await listEntries();
  return entries.find((e) => e.id === id) ?? null;
}

async function listEntriesForVehicle(vehicleId: string): Promise<FuelEntry[]> {
  const entries = await listEntries();
  return entries.filter((e) => e.vehicle_id === vehicleId);
}

/** Used by the entry form for a live preview before the user submits. */
export async function getVehicleEntryContext(
  vehicleId: string
): Promise<{ previousEntry: FuelEntry | null; priorEntries: FuelEntry[] }> {
  const entries = await listEntriesForVehicle(vehicleId);
  return { previousEntry: entries[entries.length - 1] ?? null, priorEntries: entries };
}

const EDITABLE_FIELDS: (keyof FuelEntryInput)[] = [
  "date",
  "place",
  "vehicle_id",
  "driver_id",
  "onward_reading",
  "return_reading",
  "diesel_consumed",
  "notes",
];

export interface CreateEntryOptions {
  createdBy?: string | null;
  odometerRollover?: boolean;
}

// NOTE on Supabase mode + odometer rollover: total_kms/average_kml are
// GENERATED ALWAYS STORED columns (see 01_initial_schema.sql) computed by
// Postgres as a plain `return_reading - onward_reading`. They do not know
// about the odometer-rollover override applied here client-side, so a
// rollover entry's DB-generated total_kms will still read negative in
// Supabase mode. This only affects the rare rollover path; it is a known
// limitation of keeping the schema exactly as specified rather than
// widening the generated column's formula.
export async function createEntry(
  input: FuelEntryInput,
  opts: CreateEntryOptions = {}
): Promise<{ entry: FuelEntry; evaluation: EntryEvaluation }> {
  const vehicle = await getVehicleById(input.vehicle_id);
  if (!vehicle) {
    throw new ValidationError([
      { field: "vehicle_id", severity: "ERROR", code: "NOT_FOUND", message: "Selected vehicle was not found." },
    ]);
  }
  const driver = await getDriverById(input.driver_id);
  if (!driver) {
    throw new ValidationError([
      { field: "driver_id", severity: "ERROR", code: "NOT_FOUND", message: "Selected driver was not found." },
    ]);
  }

  const vehicleEntries = await listEntriesForVehicle(vehicle.id);
  const previousEntry = vehicleEntries[vehicleEntries.length - 1] ?? null;
  const previousReturnReading = previousEntry ? previousEntry.return_reading : vehicle.starting_odometer;

  const settings = await getSettings();
  const evaluation = evaluateEntry({
    input,
    vehicle,
    driver,
    previousReturnReading,
    priorVehicleEntries: vehicleEntries,
    anomalyThresholdPct: settings.anomaly_threshold_pct,
    odometerRollover: opts.odometerRollover,
  });

  if (!evaluation.isValid) {
    throw new ValidationError(evaluation.issues.filter((i) => i.severity === "ERROR"));
  }

  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("fuel_entries")
      .insert({
        date: input.date,
        place: input.place ?? null,
        vehicle_id: input.vehicle_id,
        driver_id: input.driver_id,
        onward_reading: input.onward_reading,
        return_reading: input.return_reading,
        diesel_consumed: input.diesel_consumed,
        is_continuity_broken: evaluation.continuity.isBroken,
        is_anomalous: evaluation.anomaly.isAnomalous,
        anomaly_direction: evaluation.anomaly.direction,
        anomaly_deviation_pct: evaluation.anomaly.deviationPct,
        notes: input.notes ?? null,
        created_by: opts.createdBy ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { entry: data as FuelEntry, evaluation };
  }

  const entry: FuelEntry = {
    id: newId(),
    date: input.date,
    place: input.place ?? null,
    vehicle_id: input.vehicle_id,
    driver_id: input.driver_id,
    onward_reading: input.onward_reading,
    return_reading: input.return_reading,
    total_kms: evaluation.computed.total_kms,
    diesel_consumed: input.diesel_consumed,
    average_kml: evaluation.computed.average_kml,
    is_continuity_broken: evaluation.continuity.isBroken,
    is_anomalous: evaluation.anomaly.isAnomalous,
    anomaly_direction: evaluation.anomaly.direction,
    anomaly_deviation_pct: evaluation.anomaly.deviationPct,
    notes: input.notes ?? null,
    created_by: opts.createdBy ?? null,
    created_at: now,
    updated_at: now,
  };

  const entries = lsGet<FuelEntry[]>(LS_KEYS.entries, []);
  entries.push(entry);
  lsSet(LS_KEYS.entries, entries);
  return { entry, evaluation };
}

export interface CorrectEntryMeta {
  changedBy: string;
  reason: string;
}

export async function correctEntry(
  id: string,
  changes: Partial<FuelEntryInput>,
  meta: CorrectEntryMeta,
  opts: { odometerRollover?: boolean } = {}
): Promise<{ entry: FuelEntry; evaluation: EntryEvaluation }> {
  if (!meta.reason?.trim()) {
    throw new ValidationError([
      { field: "reason", severity: "ERROR", code: "REQUIRED", message: "A reason is required for every correction." },
    ]);
  }

  const existing = await getEntryById(id);
  if (!existing) throw new Error("Entry not found.");

  const merged: FuelEntryInput = {
    date: changes.date ?? existing.date,
    place: changes.place !== undefined ? changes.place : existing.place,
    vehicle_id: changes.vehicle_id ?? existing.vehicle_id,
    driver_id: changes.driver_id ?? existing.driver_id,
    onward_reading: changes.onward_reading ?? existing.onward_reading,
    return_reading: changes.return_reading ?? existing.return_reading,
    diesel_consumed: changes.diesel_consumed ?? existing.diesel_consumed,
    notes: changes.notes !== undefined ? changes.notes : existing.notes,
  };

  const vehicle = await getVehicleById(merged.vehicle_id);
  if (!vehicle) {
    throw new ValidationError([
      { field: "vehicle_id", severity: "ERROR", code: "NOT_FOUND", message: "Selected vehicle was not found." },
    ]);
  }
  const driver = await getDriverById(merged.driver_id);
  if (!driver) {
    throw new ValidationError([
      { field: "driver_id", severity: "ERROR", code: "NOT_FOUND", message: "Selected driver was not found." },
    ]);
  }

  const otherVehicleEntries = (await listEntriesForVehicle(vehicle.id)).filter((e) => e.id !== id);
  const previousEntry =
    otherVehicleEntries.filter((e) => e.created_at < existing.created_at).slice(-1)[0] ?? null;
  const previousReturnReading = previousEntry ? previousEntry.return_reading : vehicle.starting_odometer;

  const settings = await getSettings();
  const evaluation = evaluateEntry({
    input: merged,
    vehicle,
    driver,
    previousReturnReading,
    priorVehicleEntries: otherVehicleEntries,
    anomalyThresholdPct: settings.anomaly_threshold_pct,
    odometerRollover: opts.odometerRollover,
  });

  if (!evaluation.isValid) {
    throw new ValidationError(evaluation.issues.filter((i) => i.severity === "ERROR"));
  }

  type AuditDraft = Omit<AuditLogRecord, "id" | "created_at">;
  const auditDrafts: AuditDraft[] = [];
  const existingAsInput = existing as unknown as Record<string, unknown>;
  const mergedAsInput = merged as unknown as Record<string, unknown>;

  for (const field of EDITABLE_FIELDS) {
    const oldVal = existingAsInput[field];
    const newVal = mergedAsInput[field];
    if (String(oldVal ?? "") !== String(newVal ?? "")) {
      auditDrafts.push({
        entry_id: id,
        field_name: field,
        old_value: oldVal == null ? null : String(oldVal),
        new_value: newVal == null ? null : String(newVal),
        changed_by: meta.changedBy,
        reason: meta.reason,
      });
    }
  }
  if (existing.total_kms !== evaluation.computed.total_kms) {
    auditDrafts.push({
      entry_id: id,
      field_name: "total_kms",
      old_value: String(existing.total_kms),
      new_value: String(evaluation.computed.total_kms),
      changed_by: meta.changedBy,
      reason: meta.reason,
    });
  }
  if (existing.average_kml !== evaluation.computed.average_kml) {
    auditDrafts.push({
      entry_id: id,
      field_name: "average_kml",
      old_value: String(existing.average_kml),
      new_value: String(evaluation.computed.average_kml),
      changed_by: meta.changedBy,
      reason: meta.reason,
    });
  }

  if (auditDrafts.length === 0) {
    return { entry: existing, evaluation };
  }

  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { error: auditError } = await client.from("entry_audit_logs").insert(auditDrafts);
    if (auditError) throw new Error(auditError.message);

    const { data, error } = await client
      .from("fuel_entries")
      .update({
        date: merged.date,
        place: merged.place,
        vehicle_id: merged.vehicle_id,
        driver_id: merged.driver_id,
        onward_reading: merged.onward_reading,
        return_reading: merged.return_reading,
        diesel_consumed: merged.diesel_consumed,
        is_continuity_broken: evaluation.continuity.isBroken,
        is_anomalous: evaluation.anomaly.isAnomalous,
        anomaly_direction: evaluation.anomaly.direction,
        anomaly_deviation_pct: evaluation.anomaly.deviationPct,
        notes: merged.notes,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { entry: data as FuelEntry, evaluation };
  }

  const audits = lsGet<AuditLogRecord[]>(LS_KEYS.audit, []);
  for (const draft of auditDrafts) {
    audits.push({ ...draft, id: newId(), created_at: now });
  }
  lsSet(LS_KEYS.audit, audits);

  const updated: FuelEntry = {
    ...existing,
    ...merged,
    total_kms: evaluation.computed.total_kms,
    average_kml: evaluation.computed.average_kml,
    is_continuity_broken: evaluation.continuity.isBroken,
    is_anomalous: evaluation.anomaly.isAnomalous,
    anomaly_direction: evaluation.anomaly.direction,
    anomaly_deviation_pct: evaluation.anomaly.deviationPct,
    updated_at: now,
  };
  const entries = lsGet<FuelEntry[]>(LS_KEYS.entries, []);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx >= 0) entries[idx] = updated;
  lsSet(LS_KEYS.entries, entries);

  return { entry: updated, evaluation };
}

// ---------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------

export async function listAuditLogs(entryId: string): Promise<AuditLogRecord[]> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("entry_audit_logs")
      .select("*")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as AuditLogRecord[];
  }
  return lsGet<AuditLogRecord[]>(LS_KEYS.audit, [])
    .filter((a) => a.entry_id === entryId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client.from("settings").select("*");
    if (error) throw new Error(error.message);
    const map = new Map((data as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    return {
      fuel_rate_inr: Number(map.get("fuel_rate_inr") ?? DEFAULT_SETTINGS.fuel_rate_inr),
      anomaly_threshold_pct: Number(map.get("anomaly_threshold_pct") ?? DEFAULT_SETTINGS.anomaly_threshold_pct),
    };
  }
  return lsGet<Settings>(LS_KEYS.settings, DEFAULT_SETTINGS);
}

export async function updateSettings(changes: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...changes };

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const rows = Object.entries(next).map(([key, value]) => ({ key, value }));
    const { error } = await client.from("settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return next;
  }

  lsSet(LS_KEYS.settings, next);
  return next;
}

// ---------------------------------------------------------------------
// Garages (master data)
// ---------------------------------------------------------------------

export async function listGarages(): Promise<Garage[]> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client.from("garages").select("*").order("name");
    if (error) throw new Error(error.message);
    return data as Garage[];
  }
  return lsGet<Garage[]>(LS_KEYS.garages, []).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGarageById(id: string): Promise<Garage | null> {
  const garages = await listGarages();
  return garages.find((g) => g.id === id) ?? null;
}

export async function createGarage(input: GarageInput): Promise<Garage> {
  if (!input.name?.trim()) {
    throw new ValidationError([
      { field: "name", severity: "ERROR", code: "REQUIRED", message: "Garage name is required." },
    ]);
  }

  const record: Garage = {
    id: newId(),
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("garages")
      .insert({ name: record.name, phone: record.phone })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Garage;
  }

  const garages = lsGet<Garage[]>(LS_KEYS.garages, []);
  garages.push(record);
  lsSet(LS_KEYS.garages, garages);
  return record;
}

// ---------------------------------------------------------------------
// Garage / maintenance expenses
// ---------------------------------------------------------------------

export async function listGarageExpenses(): Promise<GarageExpense[]> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("garage_expenses")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data as GarageExpense[];
  }
  return [...lsGet<GarageExpense[]>(LS_KEYS.garageExpenses, [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );
}

export async function getGarageExpenseById(id: string): Promise<GarageExpense | null> {
  const expenses = await listGarageExpenses();
  return expenses.find((e) => e.id === id) ?? null;
}

const EDITABLE_EXPENSE_FIELDS: (keyof GarageExpenseInput)[] = [
  "date",
  "vehicle_id",
  "odometer_reading",
  "work_description",
  "garage_id",
  "bill_no",
  "amount",
  "category",
  "notes",
];

export interface CreateGarageExpenseOptions {
  createdBy?: string | null;
}

export async function createGarageExpense(
  input: GarageExpenseInput,
  opts: CreateGarageExpenseOptions = {}
): Promise<GarageExpense> {
  const issues = validateGarageExpense(input);
  if (issues.length > 0) throw new ValidationError(issues);

  const vehicle = await getVehicleById(input.vehicle_id);
  if (!vehicle) {
    throw new ValidationError([
      { field: "vehicle_id", severity: "ERROR", code: "NOT_FOUND", message: "Selected vehicle was not found." },
    ]);
  }

  const now = new Date().toISOString();
  const category = input.category?.trim() || DEFAULT_EXPENSE_CATEGORY;

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("garage_expenses")
      .insert({
        date: input.date,
        vehicle_id: input.vehicle_id,
        odometer_reading: input.odometer_reading ?? null,
        work_description: input.work_description.trim(),
        garage_id: input.garage_id ?? null,
        bill_no: input.bill_no?.trim() || null,
        amount: input.amount,
        category,
        notes: input.notes ?? null,
        created_by: opts.createdBy ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as GarageExpense;
  }

  const record: GarageExpense = {
    id: newId(),
    date: input.date,
    vehicle_id: input.vehicle_id,
    odometer_reading: input.odometer_reading ?? null,
    work_description: input.work_description.trim(),
    garage_id: input.garage_id ?? null,
    bill_no: input.bill_no?.trim() || null,
    amount: input.amount,
    category,
    notes: input.notes ?? null,
    created_by: opts.createdBy ?? null,
    created_at: now,
    updated_at: now,
  };

  const expenses = lsGet<GarageExpense[]>(LS_KEYS.garageExpenses, []);
  expenses.push(record);
  lsSet(LS_KEYS.garageExpenses, expenses);
  return record;
}

export interface CorrectGarageExpenseMeta {
  changedBy: string;
  reason: string;
}

export async function correctGarageExpense(
  id: string,
  changes: Partial<GarageExpenseInput>,
  meta: CorrectGarageExpenseMeta
): Promise<GarageExpense> {
  if (!meta.reason?.trim()) {
    throw new ValidationError([
      { field: "reason", severity: "ERROR", code: "REQUIRED", message: "A reason is required for every correction." },
    ]);
  }

  const existing = await getGarageExpenseById(id);
  if (!existing) throw new Error("Expense not found.");

  const merged: GarageExpenseInput = {
    date: changes.date ?? existing.date,
    vehicle_id: changes.vehicle_id ?? existing.vehicle_id,
    odometer_reading: changes.odometer_reading !== undefined ? changes.odometer_reading : existing.odometer_reading,
    work_description: changes.work_description ?? existing.work_description,
    garage_id: changes.garage_id !== undefined ? changes.garage_id : existing.garage_id,
    bill_no: changes.bill_no !== undefined ? changes.bill_no : existing.bill_no,
    amount: changes.amount ?? existing.amount,
    category: changes.category ?? existing.category,
    notes: changes.notes !== undefined ? changes.notes : existing.notes,
  };

  const issues = validateGarageExpense(merged);
  if (issues.length > 0) throw new ValidationError(issues);

  const vehicle = await getVehicleById(merged.vehicle_id);
  if (!vehicle) {
    throw new ValidationError([
      { field: "vehicle_id", severity: "ERROR", code: "NOT_FOUND", message: "Selected vehicle was not found." },
    ]);
  }

  type AuditDraft = Omit<GarageExpenseAuditLogRecord, "id" | "created_at">;
  const auditDrafts: AuditDraft[] = [];
  const existingAsInput = existing as unknown as Record<string, unknown>;
  const mergedAsInput = merged as unknown as Record<string, unknown>;

  for (const field of EDITABLE_EXPENSE_FIELDS) {
    const oldVal = existingAsInput[field];
    const newVal = mergedAsInput[field];
    if (String(oldVal ?? "") !== String(newVal ?? "")) {
      auditDrafts.push({
        entry_id: id,
        field_name: field,
        old_value: oldVal == null ? null : String(oldVal),
        new_value: newVal == null ? null : String(newVal),
        changed_by: meta.changedBy,
        reason: meta.reason,
      });
    }
  }

  if (auditDrafts.length === 0) {
    return existing;
  }

  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { error: auditError } = await client.from("garage_expense_audit_logs").insert(auditDrafts);
    if (auditError) throw new Error(auditError.message);

    const { data, error } = await client
      .from("garage_expenses")
      .update({
        date: merged.date,
        vehicle_id: merged.vehicle_id,
        odometer_reading: merged.odometer_reading,
        work_description: merged.work_description,
        garage_id: merged.garage_id,
        bill_no: merged.bill_no,
        amount: merged.amount,
        category: merged.category,
        notes: merged.notes,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as GarageExpense;
  }

  const audits = lsGet<GarageExpenseAuditLogRecord[]>(LS_KEYS.garageExpenseAudit, []);
  for (const draft of auditDrafts) {
    audits.push({ ...draft, id: newId(), created_at: now });
  }
  lsSet(LS_KEYS.garageExpenseAudit, audits);

  const updated: GarageExpense = { ...existing, ...merged, updated_at: now };
  const expenses = lsGet<GarageExpense[]>(LS_KEYS.garageExpenses, []);
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx >= 0) expenses[idx] = updated;
  lsSet(LS_KEYS.garageExpenses, expenses);

  return updated;
}

export async function listGarageExpenseAuditLogs(entryId: string): Promise<GarageExpenseAuditLogRecord[]> {
  if (isSupabaseConfigured) {
    const client = getSupabaseClient()!;
    const { data, error } = await client
      .from("garage_expense_audit_logs")
      .select("*")
      .eq("entry_id", entryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data as GarageExpenseAuditLogRecord[];
  }
  return lsGet<GarageExpenseAuditLogRecord[]>(LS_KEYS.garageExpenseAudit, [])
    .filter((a) => a.entry_id === entryId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------
// Seed / reset (LocalStorage mode only — Supabase data is seeded via SQL
// or the client's own entries, not overwritten from the browser)
// ---------------------------------------------------------------------

export async function seedLocalSampleData(force = false): Promise<void> {
  if (isSupabaseConfigured || typeof window === "undefined") return;
  const alreadySeeded = window.localStorage.getItem(LS_KEYS.seeded);
  if (alreadySeeded && !force) return;

  const { sampleVehicles, sampleDrivers, sampleGarages, buildSampleEntries, buildSampleGarageExpenses } =
    await import("./mockData");
  lsSet(LS_KEYS.vehicles, sampleVehicles);
  lsSet(LS_KEYS.drivers, sampleDrivers);
  lsSet(LS_KEYS.entries, buildSampleEntries(sampleVehicles, sampleDrivers));
  lsSet(LS_KEYS.audit, []);
  lsSet(LS_KEYS.garages, sampleGarages);
  lsSet(LS_KEYS.garageExpenses, buildSampleGarageExpenses(sampleVehicles, sampleGarages));
  lsSet(LS_KEYS.garageExpenseAudit, []);
  window.localStorage.setItem(LS_KEYS.seeded, "true");
}

export async function clearLocalData(): Promise<void> {
  if (isSupabaseConfigured || typeof window === "undefined") return;
  Object.values(LS_KEYS).forEach((key) => window.localStorage.removeItem(key));
}
