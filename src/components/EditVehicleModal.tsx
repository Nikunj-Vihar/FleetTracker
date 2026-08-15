"use client";

import { FormEvent, useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { useCurrentUser } from "@/lib/auth";
import { correctVehicle, ValidationError } from "@/lib/store";
import type { Vehicle } from "@/lib/types";

interface EditVehicleModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  onUpdated: (vehicle: Vehicle) => void;
}

export default function EditVehicleModal({ vehicle, onClose, onUpdated }: EditVehicleModalProps) {
  const { user } = useCurrentUser();

  const [vehicleNo, setVehicleNo] = useState(vehicle.vehicle_no);
  const [model, setModel] = useState(vehicle.model ?? "");
  const [startingOdometer, setStartingOdometer] = useState(String(vehicle.starting_odometer));
  const [expectedAvg, setExpectedAvg] = useState(vehicle.expected_avg != null ? String(vehicle.expected_avg) : "");
  const [tankCapacity, setTankCapacity] = useState(String(vehicle.tank_capacity));
  const [reason, setReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError("Please explain why this entry is being corrected.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await correctVehicle(
        vehicle.id,
        {
          vehicle_no: vehicleNo,
          model: model || null,
          starting_odometer: Number(startingOdometer),
          expected_avg: expectedAvg ? Number(expectedAvg) : null,
          tank_capacity: Number(tankCapacity),
        },
        { changedBy: user?.label ?? "Unknown", reason: reason.trim() }
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
            <Pencil size={16} /> Correct Vehicle
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label-text">Vehicle No</label>
              <input className="input-field" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} required />
            </div>
            <div>
              <label className="label-text">Model</label>
              <input className="input-field" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Starting Odometer (km)</label>
              <input
                type="number"
                className="input-field"
                value={startingOdometer}
                onChange={(e) => setStartingOdometer(e.target.value)}
              />
            </div>
            <div>
              <label className="label-text">Expected Avg (km/l)</label>
              <input
                type="number"
                step="0.1"
                className="input-field"
                value={expectedAvg}
                onChange={(e) => setExpectedAvg(e.target.value)}
                placeholder="Auto from entries"
              />
            </div>
            <div>
              <label className="label-text">Tank Capacity (L)</label>
              <input
                type="number"
                className="input-field"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label-text">Reason for correction *</label>
            <input
              className="input-field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Vehicle number mistyped at setup"
              required
            />
          </div>

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
