"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Pencil, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import { useCurrentUser } from "@/lib/auth";
import { correctEntry, getVehicleEntryContext, ValidationError } from "@/lib/store";
import { DEFAULT_ANOMALY_THRESHOLD_PCT, DEFAULT_GAP_TOLERANCE_KM, evaluateEntry } from "@/lib/validation";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

interface EditEntryModalProps {
  entry: FuelEntry;
  vehicles: Vehicle[];
  drivers: Driver[];
  anomalyThresholdPct?: number;
  defaultGapToleranceKm?: number;
  onClose: () => void;
  onUpdated: (entry: FuelEntry) => void;
}

export default function EditEntryModal({
  entry,
  vehicles,
  drivers,
  anomalyThresholdPct = DEFAULT_ANOMALY_THRESHOLD_PCT,
  defaultGapToleranceKm = DEFAULT_GAP_TOLERANCE_KM,
  onClose,
  onUpdated,
}: EditEntryModalProps) {
  const { user } = useCurrentUser();

  const [date, setDate] = useState(entry.date);
  const [place, setPlace] = useState(entry.place ?? "");
  const [vehicleId, setVehicleId] = useState(entry.vehicle_id);
  const [driverId, setDriverId] = useState(entry.driver_id);
  const [onwardReading, setOnwardReading] = useState(String(entry.onward_reading));
  const [returnReading, setReturnReading] = useState(String(entry.return_reading));
  const [dieselConsumed, setDieselConsumed] = useState(String(entry.diesel_consumed));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [odometerRollover, setOdometerRollover] = useState(false);
  const [multipleFillUps, setMultipleFillUps] = useState(false);
  const [reason, setReason] = useState("");

  const [context, setContext] = useState<{ previousReturnReading: number; priorEntries: FuelEntry[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null;
  const selectedDriver = drivers.find((d) => d.id === driverId) ?? null;

  useEffect(() => {
    getVehicleEntryContext(vehicleId).then((ctx) => {
      const others = ctx.priorEntries.filter((e) => e.id !== entry.id);
      const previous = others.filter((e) => e.created_at < entry.created_at).slice(-1)[0] ?? null;
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      setContext({
        previousReturnReading: previous ? previous.return_reading : (vehicle?.starting_odometer ?? 0),
        priorEntries: others,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const evaluation = useMemo(() => {
    if (!selectedVehicle || !selectedDriver || !context) return null;
    const onward = Number(onwardReading);
    const ret = Number(returnReading);
    const diesel = Number(dieselConsumed);
    if (Number.isNaN(onward) || Number.isNaN(ret) || Number.isNaN(diesel)) return null;
    return evaluateEntry({
      input: { date, place, vehicle_id: vehicleId, driver_id: driverId, onward_reading: onward, return_reading: ret, diesel_consumed: diesel, notes },
      vehicle: selectedVehicle,
      driver: selectedDriver,
      previousReturnReading: context.previousReturnReading,
      priorVehicleEntries: context.priorEntries,
      anomalyThresholdPct,
      odometerRollover,
      multipleFillUps,
      defaultGapToleranceKm,
    });
  }, [selectedVehicle, selectedDriver, context, date, place, vehicleId, driverId, onwardReading, returnReading, dieselConsumed, notes, anomalyThresholdPct, odometerRollover, multipleFillUps, defaultGapToleranceKm]);

  const showMultiFillUpOption = !!selectedVehicle && Number(dieselConsumed) > selectedVehicle.tank_capacity;

  const errorIssues = evaluation?.issues.filter((i) => i.severity === "ERROR") ?? [];
  const warningIssues = evaluation?.issues.filter((i) => i.severity === "WARNING") ?? [];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError("Please explain why this entry is being corrected.");
      return;
    }

    setSubmitting(true);
    try {
      const { entry: updated } = await correctEntry(
        entry.id,
        {
          date,
          place: place || null,
          vehicle_id: vehicleId,
          driver_id: driverId,
          onward_reading: Number(onwardReading),
          return_reading: Number(returnReading),
          diesel_consumed: Number(dieselConsumed),
          notes: notes || null,
        },
        { changedBy: user?.label ?? "Unknown", reason: reason.trim() },
        { odometerRollover, multipleFillUps }
      );
      onUpdated(updated);
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) {
        setError(err.issues.map((i) => i.message).join(" "));
      } else {
        setError(err instanceof Error ? err.message : "Failed to save correction.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
      <div className="glass-panel-solid w-full max-w-lg p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Pencil size={16} /> Correct Entry
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text">Date</label>
              <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Place</label>
              <input className="input-field" value={place} onChange={(e) => setPlace(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Driver</label>
              <SearchableSelect items={drivers} value={driverId} onChange={setDriverId} getId={(d) => d.id} getLabel={(d) => d.name} />
            </div>
            <div>
              <label className="label-text">Vehicle</label>
              <SearchableSelect items={vehicles} value={vehicleId} onChange={setVehicleId} getId={(v) => v.id} getLabel={(v) => v.vehicle_no} />
            </div>
            <div>
              <label className="label-text">Return Reading</label>
              <input type="number" className="input-field" value={returnReading} onChange={(e) => setReturnReading(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Onward Reading</label>
              <input type="number" className="input-field" value={onwardReading} onChange={(e) => setOnwardReading(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Diesel Consumed (L)</label>
              <input type="number" step="0.01" className="input-field" value={dieselConsumed} onChange={(e) => setDieselConsumed(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end rounded-lg border border-dashed border-slate-300 p-2 text-xs dark:border-slate-700">
              <p className="flex justify-between">
                <span className="text-slate-500">Total KMS</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">{evaluation?.computed.total_kms ?? "—"}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Average</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {evaluation ? `${evaluation.computed.average_kml} km/l` : "—"}
                </span>
              </p>
            </div>
          </div>

          <div>
            <label className="label-text">Notes</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {Number(returnReading) < Number(onwardReading) && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <input type="checkbox" className="mt-0.5" checked={odometerRollover} onChange={(e) => setOdometerRollover(e.target.checked)} />
              <span>Odometer genuinely rolled over — flag for manual review instead of rejecting.</span>
            </label>
          )}

          {showMultiFillUpOption && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <input type="checkbox" className="mt-0.5" checked={multipleFillUps} onChange={(e) => setMultipleFillUps(e.target.checked)} />
              <span>Vehicle was refueled more than once on this trip — flag for manual review instead of rejecting.</span>
            </label>
          )}

          <div>
            <label className="label-text">Reason for correction *</label>
            <input
              className="input-field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Driver misread odometer, corrected after checking photo"
              required
            />
          </div>

          {errorIssues.length > 0 && (
            <div className="space-y-1 rounded-lg bg-red-50 p-2.5 dark:bg-red-500/10">
              {errorIssues.map((issue, idx) => (
                <p key={idx} className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {issue.message}
                </p>
              ))}
            </div>
          )}
          {errorIssues.length === 0 && warningIssues.length > 0 && (
            <div className="space-y-1 rounded-lg bg-amber-50 p-2.5 dark:bg-amber-500/10">
              {warningIssues.map((issue, idx) => (
                <p key={idx} className="flex items-start gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {issue.message}
                </p>
              ))}
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
              Save Correction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
