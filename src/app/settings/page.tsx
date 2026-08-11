"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CloudOff, Database, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  confirmAccountDeletion,
  getLocalOperatorName,
  requestAccountDeletionCode,
  setLocalOperatorName,
  useCurrentUser,
} from "@/lib/auth";
import { clearLocalData, getSettings, seedLocalSampleData, updateSettings } from "@/lib/store";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [settings, setSettings] = useState<Settings>({ fuel_rate_inr: 95.5, anomaly_threshold_pct: 8 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [operatorName, setOperatorName] = useState("");
  const [resetting, setResetting] = useState(false);

  const [deleteStage, setDeleteStage] = useState<"idle" | "code-sent" | "deleting">("idle");
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);

  async function handleRequestDelete() {
    if (!user) return;
    setDeleteError(null);
    setSendingCode(true);
    try {
      await requestAccountDeletionCode(user.label);
      setDeleteStage("code-sent");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to send confirmation code.");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleConfirmDelete(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setDeleteError(null);
    setDeleteStage("deleting");
    try {
      await confirmAccountDeletion(user.label, deleteCode.trim());
      router.push("/login");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to confirm deletion.");
      setDeleteStage("code-sent");
    }
  }

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
    setOperatorName(getLocalOperatorName());
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      if (!isSupabaseConfigured) setLocalOperatorName(operatorName);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleReseed() {
    setResetting(true);
    try {
      await clearLocalData();
      await seedLocalSampleData(true);
      window.location.reload();
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Fuel rate, anomaly threshold, and data mode.</p>
      </div>

      <div className={`glass-panel flex items-center gap-3 p-4 ${isSupabaseConfigured ? "" : "border-amber-300/60"}`}>
        <span
          className={
            isSupabaseConfigured
              ? "flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
              : "flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          }
        >
          {isSupabaseConfigured ? <Database size={18} /> : <CloudOff size={18} />}
        </span>
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {isSupabaseConfigured ? "Connected to Supabase" : "Running in offline / LocalStorage mode"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isSupabaseConfigured
              ? "Data is stored in Postgres with Row Level Security."
              : "No NEXT_PUBLIC_SUPABASE_URL configured — data lives only in this browser."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="glass-panel space-y-4 p-5">
        <div>
          <label className="label-text">Fuel Rate (₹ per Litre)</label>
          <input
            type="number"
            step="0.01"
            className="input-field"
            value={settings.fuel_rate_inr}
            onChange={(e) => setSettings((s) => ({ ...s, fuel_rate_inr: Number(e.target.value) }))}
          />
          <p className="mt-1 text-xs text-slate-400">Used to estimate total fuel cost on the dashboard.</p>
        </div>

        <div>
          <label className="label-text">Anomaly Threshold (%)</label>
          <input
            type="number"
            step="0.1"
            className="input-field"
            value={settings.anomaly_threshold_pct}
            onChange={(e) => setSettings((s) => ({ ...s, anomaly_threshold_pct: Number(e.target.value) }))}
          />
          <p className="mt-1 text-xs text-slate-400">
            Entries whose average km/l deviates more than this from baseline are flagged. Default: 8%.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div>
            <label className="label-text">Your Name (for audit trail attribution)</label>
            <input
              className="input-field"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              placeholder="e.g. Depot Manager"
            />
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Settings
        </button>
        {saved && (
          <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 size={15} /> Saved
          </p>
        )}
      </form>

      {!isSupabaseConfigured && (
        <div className="glass-panel space-y-3 p-5">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sample Data</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reset this browser&apos;s local data back to the bundled sample fleet — useful for demos or starting over.
          </p>
          <button type="button" onClick={handleReseed} disabled={resetting} className="btn-danger">
            {resetting ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Reset &amp; Reseed Sample Data
          </button>
        </div>
      )}

      {isSupabaseConfigured && user && (
        <div className="glass-panel space-y-3 border-red-300/60 p-5 dark:border-red-500/30">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle size={15} /> Danger Zone
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Deleting your account permanently deletes your entire organization — every vehicle, driver, fuel entry,
            and garage expense. This cannot be undone. We&apos;ll email a confirmation code to {user.label} first.
          </p>

          {deleteStage === "idle" && (
            <button type="button" onClick={handleRequestDelete} disabled={sendingCode} className="btn-danger">
              {sendingCode ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Delete Account
            </button>
          )}

          {(deleteStage === "code-sent" || deleteStage === "deleting") && (
            <form onSubmit={handleConfirmDelete} className="space-y-3">
              <div>
                <label className="label-text">Confirmation code</label>
                <input
                  className="input-field max-w-xs"
                  value={deleteCode}
                  onChange={(e) => setDeleteCode(e.target.value)}
                  placeholder="6-digit code from your email"
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setDeleteStage("idle");
                    setDeleteCode("");
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={deleteStage === "deleting" || !deleteCode.trim()} className="btn-danger">
                  {deleteStage === "deleting" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  Confirm Permanent Deletion
                </button>
              </div>
            </form>
          )}

          {deleteError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {deleteError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
