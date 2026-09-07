"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Loader2, Pencil, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import { useCurrentUser } from "@/lib/auth";
import { correctFleetExpense, ValidationError } from "@/lib/store";
import { validateFleetExpense } from "@/lib/validation";
import { FLEET_EXPENSE_CATEGORIES } from "@/lib/fleetExpenses";
import type { FleetExpense, Vehicle } from "@/lib/types";

function isKnownCategory(value: string): boolean {
  return (FLEET_EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

interface EditFleetExpenseModalProps {
  expense: FleetExpense;
  vehicles: Vehicle[];
  onClose: () => void;
  onUpdated: (expense: FleetExpense) => void;
}

export default function EditFleetExpenseModal({ expense, vehicles, onClose, onUpdated }: EditFleetExpenseModalProps) {
  const { user } = useCurrentUser();

  const [date, setDate] = useState(expense.date);
  const [vehicleId, setVehicleId] = useState(expense.vehicle_id);
  const [tripReference, setTripReference] = useState(expense.trip_reference ?? "");
  const [description, setDescription] = useState(expense.description);
  const [category, setCategory] = useState(isKnownCategory(expense.category) ? expense.category : "Other");
  const [customCategory, setCustomCategory] = useState(isKnownCategory(expense.category) ? "" : expense.category);
  const [amount, setAmount] = useState(String(expense.amount));
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [reason, setReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedCategory = category === "Other" ? customCategory.trim() || "Other" : category;

  const issues = validateFleetExpense({
    date,
    vehicle_id: vehicleId,
    trip_reference: tripReference || null,
    category: resolvedCategory,
    description,
    amount: Number(amount),
  });
  const errorIssues = issues.filter((i) => i.severity === "ERROR");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError("Please explain why this entry is being corrected.");
      return;
    }

    setSubmitting(true);
    try {
      const updated = await correctFleetExpense(
        expense.id,
        {
          date,
          vehicle_id: vehicleId,
          trip_reference: tripReference || null,
          category: resolvedCategory,
          description,
          amount: Number(amount),
          notes: notes || null,
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
            <Pencil size={16} /> Correct Expense
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
              <label className="label-text">Vehicle</label>
              <SearchableSelect items={vehicles} value={vehicleId} onChange={setVehicleId} getId={(v) => v.id} getLabel={(v) => v.vehicle_no} />
            </div>
            <div>
              <label className="label-text">Trip Ref</label>
              <input className="input-field" value={tripReference} onChange={(e) => setTripReference(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Category</label>
              <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
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
              <label className="label-text">Description</label>
              <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Amount (₹)</label>
              <input type="number" step="0.01" className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Notes</label>
              <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-text">Reason for correction *</label>
            <input
              className="input-field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Amount mistyped, corrected after checking receipt"
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
