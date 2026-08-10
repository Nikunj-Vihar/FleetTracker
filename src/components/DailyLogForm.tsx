"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Fuel, Gauge, Loader2, MapPin, Route } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import InlineAddModal from "./InlineAddModal";
import { useCurrentUser } from "@/lib/auth";
import { createEntry, getVehicleEntryContext, getSettings, ValidationError } from "@/lib/store";
import { evaluateEntry } from "@/lib/validation";
import type { Driver, EntryEvaluation, FuelEntry, Vehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DailyLogFormProps {
  vehicles: Vehicle[];
  drivers: Driver[];
  onVehicleCreated: (vehicle: Vehicle) => void;
  onDriverCreated: (driver: Driver) => void;
  onEntryCreated: (entry: FuelEntry) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyLogForm({
  vehicles,
  drivers,
  onVehicleCreated,
  onDriverCreated,
  onEntryCreated,
}: DailyLogFormProps) {
  const { user } = useCurrentUser();

  const [date, setDate] = useState(todayIso());
  const [place, setPlace] = useState("");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [onwardReading, setOnwardReading] = useState("");
  const [returnReading, setReturnReading] = useState("");
  const [dieselConsumed, setDieselConsumed] = useState("");
  const [odometerRollover, setOdometerRollover] = useState(false);

  const [addModal, setAddModal] = useState<"vehicle" | "driver" | null>(null);
  const [vehicleContext, setVehicleContext] = useState<{
    previousEntry: FuelEntry | null;
    priorEntries: FuelEntry[];
  } | null>(null);
  const [thresholdPct, setThresholdPct] = useState(8);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const selectedDriver = drivers.find((d) => d.id === driverId) ?? null;

  useEffect(() => {
    getSettings().then((s) => setThresholdPct(s.anomaly_threshold_pct));
  }, []);

  useEffect(() => {
    if (!vehicleId) {
      setVehicleContext(null);
      return;
    }
    let cancelled = false;
    getVehicleEntryContext(vehicleId).then((ctx) => {
      if (cancelled) return;
      setVehicleContext(ctx);
      // Convenience default: pre-fill onward reading with the previous
      // trip's return reading (mirrors how the paper log carries it
      // forward). User can still override it.
      const suggested = ctx.previousEntry ? ctx.previousEntry.return_reading : selectedVehicle?.starting_odometer;
      if (suggested != null && !onwardReading) {
        setOnwardReading(String(suggested));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const preview: EntryEvaluation | null = useMemo(() => {
    if (!selectedVehicle || !selectedDriver) return null;
    const onward = Number(onwardReading);
    const ret = Number(returnReading);
    const diesel = Number(dieselConsumed);
    if (onwardReading === "" || returnReading === "" || dieselConsumed === "") return null;
    if (Number.isNaN(onward) || Number.isNaN(ret) || Number.isNaN(diesel)) return null;

    const previousReturnReading = vehicleContext?.previousEntry
      ? vehicleContext.previousEntry.return_reading
      : selectedVehicle.starting_odometer;

    return evaluateEntry({
      input: {
        date,
        place,
        vehicle_id: selectedVehicle.id,
        driver_id: selectedDriver.id,
        onward_reading: onward,
        return_reading: ret,
        diesel_consumed: diesel,
      },
      vehicle: selectedVehicle,
      driver: selectedDriver,
      previousReturnReading,
      priorVehicleEntries: vehicleContext?.priorEntries ?? [],
      anomalyThresholdPct: thresholdPct,
      odometerRollover,
    });
  }, [
    selectedVehicle,
    selectedDriver,
    onwardReading,
    returnReading,
    dieselConsumed,
    date,
    place,
    vehicleContext,
    thresholdPct,
    odometerRollover,
  ]);

  const showRolloverOption =
    onwardReading !== "" && returnReading !== "" && Number(returnReading) < Number(onwardReading);

  const errorIssues = preview?.issues.filter((i) => i.severity === "ERROR") ?? [];
  const warningIssues = preview?.issues.filter((i) => i.severity === "WARNING") ?? [];

  function resetForm(keepVehicleDriver: boolean) {
    setDate(todayIso());
    setPlace("");
    setOnwardReading("");
    setReturnReading("");
    setDieselConsumed("");
    setOdometerRollover(false);
    if (!keepVehicleDriver) {
      setVehicleId(null);
      setDriverId(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (!vehicleId || !driverId) {
      setSubmitError("Please select both a vehicle and a driver.");
      return;
    }

    setSubmitting(true);
    try {
      const { entry, evaluation } = await createEntry(
        {
          date,
          place: place || null,
          vehicle_id: vehicleId,
          driver_id: driverId,
          onward_reading: Number(onwardReading),
          return_reading: Number(returnReading),
          diesel_consumed: Number(dieselConsumed),
        },
        { createdBy: user?.id ?? null, odometerRollover }
      );

      onEntryCreated(entry);
      setSuccessMessage(
        evaluation.anomaly.isAnomalous
          ? `Trip logged — flagged for review (${evaluation.anomaly.direction === "WORSE" ? "worse" : "better"} than baseline).`
          : "Trip logged successfully."
      );
      resetForm(true);
      // Refresh vehicle context so the next entry's continuity check is current.
      const ctx = await getVehicleEntryContext(vehicleId);
      setVehicleContext(ctx);
    } catch (err) {
      if (err instanceof ValidationError) {
        setSubmitError(err.issues.map((i) => i.message).join(" "));
      } else {
        setSubmitError(err instanceof Error ? err.message : "Failed to save entry.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass-panel p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Fuel size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Daily Trip &amp; Fuel Entry</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total KMS and Average km/l are calculated automatically — never typed in.
          </p>
        </div>
      </div>

      {/* Field order deliberately mirrors the client's paper "Vehicle Running
          Status" sheet top-to-bottom — Date, Place, Driver, Vehicle No,
          Return Reading, Onward Reading, Total KMS, Diesel Consumed,
          Average — right down to Return Reading coming before Onward
          Reading, so the form feels immediately familiar. */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-text">Date *</label>
            <input type="date" required className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label-text flex items-center gap-1">
              <MapPin size={12} /> Place (optional)
            </label>
            <input
              className="input-field"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="e.g. Tirupati -> Rajahmundry"
            />
          </div>

          <div>
            <label className="label-text">Driver *</label>
            <SearchableSelect
              items={drivers}
              value={driverId}
              onChange={setDriverId}
              getId={(d) => d.id}
              getLabel={(d) => d.name}
              getSubLabel={(d) => d.phone}
              placeholder="Select driver"
              onAddNew={() => setAddModal("driver")}
              addNewLabel="Add new driver"
            />
          </div>
          <div>
            <label className="label-text">Vehicle No *</label>
            <SearchableSelect
              items={vehicles}
              value={vehicleId}
              onChange={setVehicleId}
              getId={(v) => v.id}
              getLabel={(v) => v.vehicle_no}
              getSubLabel={(v) => v.model}
              placeholder="Select vehicle"
              onAddNew={() => setAddModal("vehicle")}
              addNewLabel="Add new vehicle"
            />
          </div>

          <div>
            <label className="label-text">Return Reading (km) *</label>
            <input
              type="number"
              inputMode="decimal"
              required
              className="input-field"
              value={returnReading}
              onChange={(e) => setReturnReading(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="label-text">Onward Reading (km) *</label>
            <input
              type="number"
              inputMode="decimal"
              required
              className="input-field"
              value={onwardReading}
              onChange={(e) => setOnwardReading(e.target.value)}
              placeholder="0"
            />
            {vehicleContext?.previousEntry && (
              <p className="mt-1 text-xs text-slate-400">
                Previous return reading: {vehicleContext.previousEntry.return_reading} km
              </p>
            )}
          </div>

          <div className="flex flex-col justify-center rounded-lg border border-dashed border-slate-300 px-3 py-2 dark:border-slate-700">
            <span className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Route size={14} /> Total KMS
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {preview ? preview.computed.total_kms : "—"}
              </span>
            </span>
          </div>
          <div>
            <label className="label-text">Diesel Consumed (L) *</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              className="input-field"
              value={dieselConsumed}
              onChange={(e) => setDieselConsumed(e.target.value)}
              placeholder="0.00"
            />
            {selectedVehicle && (
              <p className="mt-1 text-xs text-slate-400">Tank capacity: {selectedVehicle.tank_capacity} L</p>
            )}
          </div>

          <div className="flex flex-col justify-center rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2 dark:border-brand-500/40 dark:bg-brand-500/5 sm:col-span-2">
            <span className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Gauge size={14} /> Average
              </span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {preview ? `${preview.computed.average_kml} km/l` : "—"}
              </span>
            </span>
          </div>
        </div>

        {showRolloverOption && (
          <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={odometerRollover}
              onChange={(e) => setOdometerRollover(e.target.checked)}
            />
            <span>
              Return reading is less than onward reading — this is normally a hard rejection (negative KMS is not
              physically possible). If the odometer genuinely rolled over past its maximum, tick this box to flag it
              for manual review instead of blocking the entry.
            </span>
          </label>
        )}

        {errorIssues.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-red-50 p-3 dark:bg-red-500/10">
            {errorIssues.map((issue, idx) => (
              <p key={idx} className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {issue.message}
              </p>
            ))}
          </div>
        )}

        {errorIssues.length === 0 && warningIssues.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-amber-50 p-3 dark:bg-amber-500/10">
            {warningIssues.map((issue, idx) => (
              <p key={idx} className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {issue.message}
              </p>
            ))}
          </div>
        )}

        {submitError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {submitError}
          </p>
        )}
        {successMessage && (
          <p
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm",
              "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
            )}
          >
            <CheckCircle2 size={16} /> {successMessage}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Fuel size={16} />}
          Save Trip Entry
        </button>
      </form>

      {addModal && (
        <InlineAddModal
          type={addModal}
          onClose={() => setAddModal(null)}
          onCreated={(record) => {
            if (addModal === "vehicle") {
              const vehicle = record as Vehicle;
              onVehicleCreated(vehicle);
              setVehicleId(vehicle.id);
            } else {
              const driver = record as Driver;
              onDriverCreated(driver);
              setDriverId(driver.id);
            }
            setAddModal(null);
          }}
        />
      )}
    </div>
  );
}
