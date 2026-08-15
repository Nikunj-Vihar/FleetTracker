"use client";

import { FormEvent, useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { useCurrentUser } from "@/lib/auth";
import { correctDriver, ValidationError } from "@/lib/store";
import type { Driver } from "@/lib/types";

interface EditDriverModalProps {
  driver: Driver;
  onClose: () => void;
  onUpdated: (driver: Driver) => void;
}

export default function EditDriverModal({ driver, onClose, onUpdated }: EditDriverModalProps) {
  const { user } = useCurrentUser();

  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone ?? "");
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
      const updated = await correctDriver(
        driver.id,
        { name, phone: phone || null },
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
      <div className="glass-panel-solid w-full max-w-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <Pencil size={16} /> Correct Driver
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label-text">Name</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label-text">Phone</label>
            <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label className="label-text">Reason for correction *</label>
            <input
              className="input-field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Name misspelled at setup"
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
