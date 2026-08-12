"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Loader2, Pencil, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import { useCurrentUser } from "@/lib/auth";
import { correctGarageExpense, ValidationError } from "@/lib/store";
import { validateGarageExpense } from "@/lib/validation";
import type { Garage, GarageExpense, Vehicle } from "@/lib/types";

interface EditGarageExpenseModalProps {
  expense: GarageExpense;
  vehicles: Vehicle[];
  garages: Garage[];
  onClose: () => void;
  onUpdated: (expense: GarageExpense) => void;
}

export default function EditGarageExpenseModal({
  expense,
  vehicles,
  garages,
  onClose,
  onUpdated,
}: EditGarageExpenseModalProps) {
  const { user } = useCurrentUser();

  const [date, setDate] = useState(expense.date);
  const [vehicleId, setVehicleId] = useState(expense.vehicle_id);
  const [odometerReading, setOdometerReading] = useState(
    expense.odometer_reading != null ? String(expense.odometer_reading) : ""
  );
  const [workDescription, setWorkDescription] = useState(expense.work_description);
  const [garageId, setGarageId] = useState<string | null>(expense.garage_id);
  const [billNo, setBillNo] = useState(expense.bill_no ?? "");
  const [amount, setAmount] = useState(String(expense.amount));
  const [isPaid, setIsPaid] = useState(expense.is_paid);
  const [paidDate, setPaidDate] = useState(expense.paid_date ?? "");
  const [reason, setReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issues = validateGarageExpense({
    date,
    vehicle_id: vehicleId,
    odometer_reading: odometerReading ? Number(odometerReading) : null,
    work_description: workDescription,
    garage_id: garageId,
    bill_no: billNo || null,
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
      const updated = await correctGarageExpense(
        expense.id,
        {
          date,
          vehicle_id: vehicleId,
          odometer_reading: odometerReading ? Number(odometerReading) : null,
          work_description: workDescription,
          garage_id: garageId,
          bill_no: billNo || null,
          amount: Number(amount),
          is_paid: isPaid,
          paid_date: isPaid ? paidDate || null : null,
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
              <label className="label-text">Odometer Reading (km)</label>
              <input type="number" className="input-field" value={odometerReading} onChange={(e) => setOdometerReading(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Garage</label>
              <SearchableSelect items={garages} value={garageId} onChange={setGarageId} getId={(g) => g.id} getLabel={(g) => g.name} />
            </div>
            <div className="sm:col-span-2">
              <label className="label-text">Type of Work / Replacement</label>
              <input className="input-field" value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Bill No.</label>
              <input className="input-field" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Total Cost (₹)</label>
              <input type="number" step="0.01" className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                />
                Paid
              </label>
              {isPaid && (
                <div className="flex items-center gap-2">
                  <label className="label-text mb-0">Paid on</label>
                  <input
                    type="date"
                    className="input-field w-40"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="label-text">Reason for correction *</label>
            <input
              className="input-field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bill amount mistyped, corrected after checking invoice"
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
