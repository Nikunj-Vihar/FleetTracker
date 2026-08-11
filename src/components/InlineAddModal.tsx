"use client";

import { FormEvent, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { createDriver, createGarage, createVehicle, ValidationError } from "@/lib/store";
import type { Driver, Garage, Vehicle } from "@/lib/types";

interface InlineAddModalProps {
  type: "vehicle" | "driver" | "garage";
  onClose: () => void;
  onCreated: (record: Vehicle | Driver | Garage) => void;
}

export default function InlineAddModal({ type, onClose, onCreated }: InlineAddModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vehicleNo, setVehicleNo] = useState("");
  const [model, setModel] = useState("");
  const [startingOdometer, setStartingOdometer] = useState("");
  const [expectedAvg, setExpectedAvg] = useState("");
  const [tankCapacity, setTankCapacity] = useState("300");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (type === "vehicle") {
        const vehicle = await createVehicle({
          vehicle_no: vehicleNo,
          model: model || null,
          starting_odometer: Number(startingOdometer) || 0,
          expected_avg: expectedAvg ? Number(expectedAvg) : null,
          tank_capacity: Number(tankCapacity) || 300,
        });
        onCreated(vehicle);
      } else if (type === "driver") {
        const driver = await createDriver({ name, phone: phone || null });
        onCreated(driver);
      } else {
        const garage = await createGarage({ name, phone: phone || null });
        onCreated(garage);
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        setError(err.issues.map((i) => i.message).join(" "));
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="glass-panel-solid w-full max-w-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Add New {type === "vehicle" ? "Vehicle" : type === "driver" ? "Driver" : "Garage"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {type === "vehicle" ? (
            <>
              <div>
                <label className="label-text">Vehicle No *</label>
                <input
                  className="input-field"
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="TN-38-AB-2392"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label-text">Model / Type (optional)</label>
                <input className="input-field" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Tata 1613" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-text">Starting Odometer</label>
                  <input
                    className="input-field"
                    type="number"
                    inputMode="decimal"
                    value={startingOdometer}
                    onChange={(e) => setStartingOdometer(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="label-text">Tank Capacity (L)</label>
                  <input
                    className="input-field"
                    type="number"
                    inputMode="decimal"
                    value={tankCapacity}
                    onChange={(e) => setTankCapacity(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="label-text">Expected Avg km/l (optional)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={expectedAvg}
                  onChange={(e) => setExpectedAvg(e.target.value)}
                  placeholder="Leave blank to auto-establish from entries"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label-text">{type === "driver" ? "Driver Name *" : "Garage Name *"}</label>
                <input
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={type === "driver" ? "Murugan S" : "Universal Tyres"}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label-text">Phone (optional)</label>
                <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98400 11122" />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Add {type === "vehicle" ? "Vehicle" : type === "driver" ? "Driver" : "Garage"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
