"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Receipt, Wrench } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import InlineAddModal from "./InlineAddModal";
import { useCurrentUser } from "@/lib/auth";
import { createGarageExpense, ValidationError } from "@/lib/store";
import { validateGarageExpense } from "@/lib/validation";
import type { Garage, GarageExpense, Vehicle } from "@/lib/types";

interface GarageExpenseFormProps {
  vehicles: Vehicle[];
  garages: Garage[];
  onVehicleCreated: (vehicle: Vehicle) => void;
  onGarageCreated: (garage: Garage) => void;
  onExpenseCreated: (expense: GarageExpense) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function GarageExpenseForm({
  vehicles,
  garages,
  onVehicleCreated,
  onGarageCreated,
  onExpenseCreated,
}: GarageExpenseFormProps) {
  const { user } = useCurrentUser();

  const [date, setDate] = useState(todayIso());
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [odometerReading, setOdometerReading] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [garageId, setGarageId] = useState<string | null>(null);
  const [billNo, setBillNo] = useState("");
  const [amount, setAmount] = useState("");

  const [addModal, setAddModal] = useState<"vehicle" | "garage" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const preview =
    vehicleId && workDescription && amount
      ? validateGarageExpense({
          date,
          vehicle_id: vehicleId,
          odometer_reading: odometerReading ? Number(odometerReading) : null,
          work_description: workDescription,
          garage_id: garageId,
          bill_no: billNo || null,
          amount: Number(amount),
        })
      : [];
  const errorIssues = preview.filter((i) => i.severity === "ERROR");

  function resetForm() {
    setDate(todayIso());
    setOdometerReading("");
    setWorkDescription("");
    setBillNo("");
    setAmount("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (!vehicleId) {
      setSubmitError("Please select a vehicle.");
      return;
    }

    setSubmitting(true);
    try {
      const expense = await createGarageExpense(
        {
          date,
          vehicle_id: vehicleId,
          odometer_reading: odometerReading ? Number(odometerReading) : null,
          work_description: workDescription,
          garage_id: garageId,
          bill_no: billNo || null,
          amount: Number(amount),
        },
        { createdBy: user?.id ?? null }
      );

      onExpenseCreated(expense);
      setSuccessMessage("Expense logged successfully.");
      resetForm();
    } catch (err) {
      if (err instanceof ValidationError) {
        setSubmitError(err.issues.map((i) => i.message).join(" "));
      } else {
        setSubmitError(err instanceof Error ? err.message : "Failed to save expense.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass-panel p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Wrench size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Garage / Maintenance Expense</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            One record per bill — if the same visit covers two garages, log them separately.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label-text">Date *</label>
            <input type="date" required className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Vehicle *</label>
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
            <label className="label-text">Odometer Reading (km)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input-field"
              value={odometerReading}
              onChange={(e) => setOdometerReading(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="label-text">Garage</label>
            <SearchableSelect
              items={garages}
              value={garageId}
              onChange={setGarageId}
              getId={(g) => g.id}
              getLabel={(g) => g.name}
              placeholder="Select garage"
              onAddNew={() => setAddModal("garage")}
              addNewLabel="Add new garage"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label-text">Type of Work / Replacement *</label>
            <input
              className="input-field"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              placeholder="e.g. Front tyre replaced"
              required
            />
          </div>

          <div>
            <label className="label-text">Bill No.</label>
            <input className="input-field" value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="label-text flex items-center gap-1">
              <Receipt size={12} /> Total Cost (₹) *
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              className="input-field"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        {errorIssues.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-red-50 p-3 dark:bg-red-500/10">
            {errorIssues.map((issue, idx) => (
              <p key={idx} className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
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
          <p className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-300">
            <CheckCircle2 size={16} /> {successMessage}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
          Save Expense
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
              const garage = record as Garage;
              onGarageCreated(garage);
              setGarageId(garage.id);
            }
            setAddModal(null);
          }}
        />
      )}
    </div>
  );
}
