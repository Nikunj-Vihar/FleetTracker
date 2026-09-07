"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Receipt, Route } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import InlineAddModal from "./InlineAddModal";
import { useCurrentUser } from "@/lib/auth";
import { createFleetExpense, ValidationError } from "@/lib/store";
import { validateFleetExpense } from "@/lib/validation";
import { FLEET_EXPENSE_CATEGORIES } from "@/lib/fleetExpenses";
import type { FleetExpense, Vehicle } from "@/lib/types";

interface FleetExpenseFormProps {
  vehicles: Vehicle[];
  onVehicleCreated: (vehicle: Vehicle) => void;
  onExpenseCreated: (expense: FleetExpense) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FleetExpenseForm({ vehicles, onVehicleCreated, onExpenseCreated }: FleetExpenseFormProps) {
  const { user } = useCurrentUser();

  const [date, setDate] = useState(todayIso());
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [tripReference, setTripReference] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [addVehicleModal, setAddVehicleModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const resolvedCategory = category === "Other" ? customCategory.trim() || "Other" : category;

  const preview =
    vehicleId && description && amount
      ? validateFleetExpense({
          date,
          vehicle_id: vehicleId,
          trip_reference: tripReference || null,
          category: resolvedCategory,
          description,
          amount: Number(amount),
        })
      : [];
  const errorIssues = preview.filter((i) => i.severity === "ERROR");

  function resetForm() {
    setDate(todayIso());
    setTripReference("");
    setDescription("");
    setCategory("");
    setCustomCategory("");
    setAmount("");
    setNotes("");
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
      const expense = await createFleetExpense(
        {
          date,
          vehicle_id: vehicleId,
          trip_reference: tripReference || null,
          category: resolvedCategory,
          description,
          amount: Number(amount),
          notes: notes || null,
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
          <Route size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Fleet / Trip Expense</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tolls, RTO/checkpost fees, loading &amp; unloading, driver allowance — give lines from the same trip a
            matching Trip Ref to see them totaled together.
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
              onAddNew={() => setAddVehicleModal(true)}
              addNewLabel="Add new vehicle"
            />
          </div>

          <div>
            <label className="label-text">Trip Ref</label>
            <input
              className="input-field"
              value={tripReference}
              onChange={(e) => setTripReference(e.target.value)}
              placeholder="Optional, e.g. TRP-1042"
            />
          </div>
          <div className={category === "Other" ? "sm:col-span-1" : ""}>
            <label className="label-text">Category *</label>
            <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)} required>
              <option value="" disabled>
                Select category
              </option>
              {FLEET_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {category === "Other" && (
            <div>
              <label className="label-text">Specify category</label>
              <input
                className="input-field"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="e.g. Ferry crossing"
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="label-text">Description *</label>
            <input
              className="input-field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Chatti RTO checkpost fee"
              required
            />
          </div>

          <div>
            <label className="label-text flex items-center gap-1">
              <Receipt size={12} /> Amount (₹) *
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
          <div>
            <label className="label-text">Notes</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
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
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Route size={16} />}
          Save Expense
        </button>
      </form>

      {addVehicleModal && (
        <InlineAddModal
          type="vehicle"
          onClose={() => setAddVehicleModal(false)}
          onCreated={(record) => {
            const vehicle = record as Vehicle;
            onVehicleCreated(vehicle);
            setVehicleId(vehicle.id);
            setAddVehicleModal(false);
          }}
        />
      )}
    </div>
  );
}
