"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bell } from "lucide-react";
import { alertKindStyle, computeFlaggedAlerts, type FlaggedAlertCard } from "@/lib/flaggedAlerts";
import { getFlagsLastSeenAt, markFlagsSeenNow } from "@/lib/notifications";
import { getSettings, listDrivers, listEntries, listVehicles, seedLocalSampleData } from "@/lib/store";
import { DEFAULT_GAP_TOLERANCE_KM } from "@/lib/validation";
import { formatDate } from "@/lib/utils";

const PREVIEW_LIMIT = 5;

export default function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<FlaggedAlertCard[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    // This component mounts independently of any page's own data-loading
    // effect (it lives in the persistent navbar), so in LocalStorage/demo
    // mode it needs to seed itself too — otherwise on a fresh browser it
    // can race the Dashboard's own seed call and read an empty store.
    // No-op in Supabase mode, and idempotent once already seeded.
    await seedLocalSampleData();
    const [entries, vehicles, drivers, settings] = await Promise.all([
      listEntries(),
      listVehicles(),
      listDrivers(),
      getSettings(),
    ]);
    setAlerts(computeFlaggedAlerts(entries, vehicles, drivers, settings.continuity_gap_tolerance_km ?? DEFAULT_GAP_TOLERANCE_KM));
    setLastSeenAt(getFlagsLastSeenAt());
  }, []);

  // Refetches on mount and whenever the user navigates to a different page —
  // this component lives in the persistent navbar, so it wouldn't otherwise
  // ever know a new entry got logged elsewhere in the app.
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const newCount = useMemo(() => {
    if (!lastSeenAt) return alerts.length;
    return alerts.filter((a) => a.entry.created_at > lastSeenAt).length;
  }, [alerts, lastSeenAt]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      refresh();
      markFlagsSeenNow();
      setLastSeenAt(new Date().toISOString());
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
        aria-label="Flagged entry notifications"
        title="Flagged entries"
      >
        <Bell size={18} />
        {newCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {newCount > 9 ? "9+" : newCount}
          </span>
        )}
      </button>

      {open && (
        <div className="glass-panel-solid fixed inset-x-4 top-16 z-50 mt-2 overflow-hidden sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[340px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Flagged Entries</h2>
            <span className="text-xs text-slate-400">{alerts.length} total</span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">Nothing flagged — everything checks out.</p>
            ) : (
              alerts.slice(0, PREVIEW_LIMIT).map((alert, idx) => {
                const styles = alertKindStyle(alert.kind);
                const Icon = styles.icon;
                return (
                  <div
                    key={`${alert.entry.id}-${alert.kind}-${idx}`}
                    className="flex items-start gap-2.5 border-b border-slate-100 px-3.5 py-2.5 last:border-0 dark:border-slate-800"
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${styles.iconWrapClass}`}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1">
                        <span className={`badge ${styles.badge}`}>
                          <AlertTriangle size={10} /> {styles.label}
                        </span>
                        <span className="text-[11px] text-slate-400">{formatDate(alert.entry.date)}</span>
                      </div>
                      <p className="truncate text-xs text-slate-600 dark:text-slate-300">
                        {alert.vehicleNo} · {alert.driverName}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3.5 py-2.5 text-center text-xs font-semibold text-brand-600 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-400 dark:hover:bg-slate-800/60"
          >
            View all on Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
