"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Database,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Truck,
  User,
} from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  confirmAccountDeletion,
  getLocalOperatorName,
  requestAccountDeletionCode,
  setLocalOperatorName,
  useCurrentUser,
} from "@/lib/auth";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import {
  clearDeletedDriversLog,
  clearDeletedVehiclesLog,
  clearLocalData,
  getSettings,
  listDeletedDrivers,
  listDeletedVehicles,
  restoreDriver,
  restoreVehicle,
  seedLocalSampleData,
  updateSettings,
} from "@/lib/store";
import { ALERTABLE_CATEGORIES, DEFAULT_MAINTENANCE_INTERVALS } from "@/lib/maintenance";
import { formatDate } from "@/lib/utils";
import type { Driver, Settings, Vehicle } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [settings, setSettings] = useState<Settings>({
    fuel_rate_inr: 95.5,
    anomaly_threshold_pct: 8,
    maintenance_intervals: DEFAULT_MAINTENANCE_INTERVALS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [operatorName, setOperatorName] = useState("");
  const [resetting, setResetting] = useState(false);

  const [deleteStage, setDeleteStage] = useState<"idle" | "code-sent" | "deleting">("idle");
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);

  const [deletedVehicles, setDeletedVehicles] = useState<Vehicle[]>([]);
  const [deletedDrivers, setDeletedDrivers] = useState<Driver[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showClearLog, setShowClearLog] = useState(false);

  async function refreshDeleted() {
    const [dv, dd] = await Promise.all([listDeletedVehicles(), listDeletedDrivers()]);
    setDeletedVehicles(dv);
    setDeletedDrivers(dd);
    setLoadingDeleted(false);
  }

  async function handleRestoreVehicle(id: string) {
    setRestoringId(id);
    try {
      await restoreVehicle(id, user?.label ?? "Unknown");
      setDeletedVehicles((prev) => prev.filter((v) => v.id !== id));
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreDriver(id: string) {
    setRestoringId(id);
    try {
      await restoreDriver(id, user?.label ?? "Unknown");
      setDeletedDrivers((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setRestoringId(null);
    }
  }

  const recentlyDeleted = useMemo(() => {
    const vehicleRows = deletedVehicles.map((v) => ({
      kind: "vehicle" as const,
      id: v.id,
      label: v.vehicle_no,
      deletedAt: v.deleted_at as string,
      deletedBy: v.deleted_by,
      reason: v.delete_reason,
    }));
    const driverRows = deletedDrivers.map((d) => ({
      kind: "driver" as const,
      id: d.id,
      label: d.name,
      deletedAt: d.deleted_at as string,
      deletedBy: d.deleted_by,
      reason: d.delete_reason,
    }));
    return [...vehicleRows, ...driverRows].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }, [deletedVehicles, deletedDrivers]);

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
    refreshDeleted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        <div>
          <label className="label-text">Maintenance Intervals</label>
          <p className="mb-2 text-xs text-slate-400">
            How often each category is expected to need service — a truck gets flagged &ldquo;due soon&rdquo; once it
            passes whichever threshold (distance or time) it hits first. Leave a field blank to skip that check for a
            category.
          </p>
          <div className="space-y-2">
            {ALERTABLE_CATEGORIES.map((category) => {
              const interval = settings.maintenance_intervals[category] ?? { km: null, months: null };
              return (
                <div key={category} className="grid grid-cols-3 items-center gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{category}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      value={interval.km ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          maintenance_intervals: {
                            ...s.maintenance_intervals,
                            [category]: { ...interval, km: e.target.value === "" ? null : Number(e.target.value) },
                          },
                        }))
                      }
                    />
                    <span className="shrink-0 text-xs text-slate-400">km</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      value={interval.months ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          maintenance_intervals: {
                            ...s.maintenance_intervals,
                            [category]: { ...interval, months: e.target.value === "" ? null : Number(e.target.value) },
                          },
                        }))
                      }
                    />
                    <span className="shrink-0 text-xs text-slate-400">months</span>
                  </div>
                </div>
              );
            })}
          </div>
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

      <div className="glass-panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Recently Deleted</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deleted drivers and vehicles stay here, restorable, until you clear the log yourself — nothing is
              purged automatically.
            </p>
          </div>
          {recentlyDeleted.length > 0 && (
            <button type="button" onClick={() => setShowClearLog(true)} className="btn-secondary text-red-600 dark:text-red-400">
              <Trash2 size={14} /> Clear Log
            </button>
          )}
        </div>

        {loadingDeleted ? (
          <div className="flex h-16 items-center justify-center text-slate-400">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : recentlyDeleted.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nothing deleted yet.</p>
        ) : (
          <div className="space-y-2">
            {recentlyDeleted.map((row) => (
              <div
                key={`${row.kind}-${row.id}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                    {row.kind === "vehicle" ? <Truck size={14} /> : <User size={14} />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{row.label}</p>
                    <p className="truncate text-xs text-slate-400">
                      Deleted {formatDate(row.deletedAt)} by {row.deletedBy ?? "Unknown"}
                      {row.reason ? ` — ${row.reason}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={restoringId === row.id}
                  onClick={() => (row.kind === "vehicle" ? handleRestoreVehicle(row.id) : handleRestoreDriver(row.id))}
                  className="btn-secondary shrink-0 px-2.5 py-1.5 text-xs"
                >
                  {restoringId === row.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {showClearLog && (
        <ConfirmDeleteModal
          title="Clear Recently Deleted Log"
          description={`This permanently deletes all ${recentlyDeleted.length} item(s) currently in the log. Any of them that still have trip entries or garage expenses will delete those too — this cannot be undone, and none of it is restorable afterward.`}
          confirmationLabel="I understand this permanently deletes these records and any trip/expense history still attached to them."
          confirmButtonLabel="Clear Log Permanently"
          onClose={() => setShowClearLog(false)}
          onConfirm={async () => {
            await Promise.all([clearDeletedVehiclesLog(), clearDeletedDriversLog()]);
            setDeletedVehicles([]);
            setDeletedDrivers([]);
            setShowClearLog(false);
          }}
        />
      )}
    </div>
  );
}
