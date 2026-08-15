"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

interface ConfirmDeleteModalProps {
  title: string;
  description: string;
  confirmationLabel: string;
  confirmButtonLabel?: string;
  requireReason?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function ConfirmDeleteModal({
  title,
  description,
  confirmationLabel,
  confirmButtonLabel = "Delete",
  requireReason = false,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = checked && (!requireReason || reason.trim().length > 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete this action.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="glass-panel-solid w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle size={17} /> {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
            {description}
          </p>

          {requireReason && (
            <div>
              <label className="label-text">Reason *</label>
              <input
                className="input-field"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Added by mistake, duplicate entry"
                required
                autoFocus
              />
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {confirmationLabel}
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit || submitting} className="btn-danger">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {confirmButtonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
