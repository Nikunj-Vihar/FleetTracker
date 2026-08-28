"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, GitBranch, History, Loader2, Pencil, Search, ShieldAlert, TrendingUp, X } from "lucide-react";
import CsvExportButton from "@/components/CsvExportButton";
import AuditTrailModal from "@/components/AuditTrailModal";
import EditEntryModal from "@/components/EditEntryModal";
import { getSettings, listDrivers, listEntries, listVehicles, seedLocalSampleData } from "@/lib/store";
import { DEFAULT_MAINTENANCE_INTERVALS } from "@/lib/maintenance";
import { annotateContinuitySeverity, DEFAULT_GAP_TOLERANCE_KM } from "@/lib/validation";
import { alertKindStyle, computeFlaggedAlerts, type FlaggedAlertCard } from "@/lib/flaggedAlerts";
import { formatDate } from "@/lib/utils";
import type { Driver, FuelEntry, Settings, Vehicle } from "@/lib/types";

export default function EntriesPage() {
  return (
    <Suspense fallback={null}>
      <EntriesPageContent />
    </Suspense>
  );
}

function EntriesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("entry");
  const highlightRef = useRef<HTMLElement | null>(null);

  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [settings, setSettings] = useState<Settings>({
    fuel_rate_inr: 95.5,
    anomaly_threshold_pct: 8,
    maintenance_intervals: DEFAULT_MAINTENANCE_INTERVALS,
    continuity_gap_tolerance_km: DEFAULT_GAP_TOLERANCE_KM,
  });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const [auditEntry, setAuditEntry] = useState<FuelEntry | null>(null);
  const [editEntry, setEditEntry] = useState<FuelEntry | null>(null);

  async function load() {
    await seedLocalSampleData();
    const [e, v, d, s] = await Promise.all([listEntries(), listVehicles(), listDrivers(), getSettings()]);
    setEntries([...e].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setVehicles(v);
    setDrivers(d);
    setSettings(s);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const driverMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const continuitySeverity = useMemo(
    () => annotateContinuitySeverity(entries, vehicles, settings.continuity_gap_tolerance_km),
    [entries, vehicles, settings.continuity_gap_tolerance_km]
  );

  // Same flag messages shown on the Dashboard's Flagged Entries cards and
  // the notification bell, grouped by entry id so a deep-linked row can
  // show "what the flag is about" inline instead of just landing on it.
  const flaggedByEntry = useMemo(() => {
    const cards = computeFlaggedAlerts(entries, vehicles, drivers, settings.continuity_gap_tolerance_km);
    const map = new Map<string, FlaggedAlertCard[]>();
    for (const card of cards) {
      const list = map.get(card.entry.id) ?? [];
      list.push(card);
      map.set(card.entry.id, list);
    }
    return map;
  }, [entries, vehicles, drivers, settings.continuity_gap_tolerance_km]);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, loading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (vehicleFilter !== "all" && e.vehicle_id !== vehicleFilter) return false;
      if (driverFilter !== "all" && e.driver_id !== driverFilter) return false;
      if (flaggedOnly && !e.is_anomalous && !e.is_continuity_broken) return false;
      if (q) {
        const vehicleNo = vehicleMap.get(e.vehicle_id)?.vehicle_no.toLowerCase() ?? "";
        const driverName = driverMap.get(e.driver_id)?.name.toLowerCase() ?? "";
        const place = (e.place ?? "").toLowerCase();
        if (!vehicleNo.includes(q) && !driverName.includes(q) && !place.includes(q) && !e.date.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, search, vehicleFilter, driverFilter, flaggedOnly, vehicleMap, driverMap]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Log History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} of {entries.length} entries</p>
        </div>
        <CsvExportButton entries={filtered} vehicles={vehicles} drivers={drivers} />
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-3 p-3">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <Search size={15} className="text-slate-400" />
          <input
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search vehicle, driver, place, date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input-field w-auto" value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
          <option value="all">All vehicles</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.vehicle_no}</option>
          ))}
        </select>
        <select className="input-field w-auto" value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
          <option value="all">All drivers</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Flagged only
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel px-3 py-10 text-center text-sm text-slate-400">
          <AlertTriangle size={20} className="mx-auto mb-2 opacity-40" />
          No entries match your filters.
        </div>
      ) : (
        <>
          {/* Card list — below md (also covers the 640-767px tablet range,
              where this 900px-wide table would overflow the viewport
              rather than just scroll within its own container). */}
          <div className="space-y-2 md:hidden">
            {filtered.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                vehicleNo={vehicleMap.get(entry.vehicle_id)?.vehicle_no ?? "—"}
                driverName={driverMap.get(entry.driver_id)?.name ?? "—"}
                continuitySeverity={continuitySeverity.get(entry.id) ?? null}
                onEdit={() => setEditEntry(entry)}
                onAudit={() => setAuditEntry(entry)}
                highlighted={entry.id === highlightId}
                onHighlightMount={entry.id === highlightId ? (el) => { highlightRef.current = el; } : undefined}
                onDismissHighlight={() => router.replace("/entries")}
                flagCards={flaggedByEntry.get(entry.id)}
              />
            ))}
          </div>

          {/* Full table — md and up, matching Navbar's own mobile/desktop breakpoint */}
          <div className="glass-panel hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Vehicle</th>
                  <th className="px-3 py-2.5">Driver</th>
                  <th className="px-3 py-2.5">Place</th>
                  <th className="px-3 py-2.5 text-right">Onward</th>
                  <th className="px-3 py-2.5 text-right">Return</th>
                  <th className="px-3 py-2.5 text-right">KMS</th>
                  <th className="px-3 py-2.5 text-right">Diesel (L)</th>
                  <th className="px-3 py-2.5 text-right">Avg</th>
                  <th className="px-3 py-2.5">Flags</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const isHighlighted = entry.id === highlightId;
                  const flagCards = flaggedByEntry.get(entry.id);
                  return (
                  <Fragment key={entry.id}>
                  <tr
                    ref={isHighlighted ? (el) => { highlightRef.current = el; } : undefined}
                    className={
                      isHighlighted
                        ? "border-b border-slate-100 bg-brand-50/70 ring-1 ring-inset ring-brand-300 last:border-0 dark:border-slate-800 dark:bg-brand-500/10 dark:ring-brand-500/40"
                        : "border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700 dark:text-slate-200">{formatDate(entry.date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                      {vehicleMap.get(entry.vehicle_id)?.vehicle_no ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-300">
                      {driverMap.get(entry.driver_id)?.name ?? "—"}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-slate-500 dark:text-slate-400">{entry.place ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{entry.onward_reading}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{entry.return_reading}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{entry.total_kms}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{entry.diesel_consumed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{entry.average_kml}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {entry.is_anomalous && entry.anomaly_direction === "WORSE" && (
                          <span className="badge badge-worse"><ShieldAlert size={11} /> Worse</span>
                        )}
                        {entry.is_anomalous && entry.anomaly_direction === "BETTER" && (
                          <span className="badge badge-better"><TrendingUp size={11} /> Better</span>
                        )}
                        {entry.is_continuity_broken && continuitySeverity.get(entry.id) === "INFO" && (
                          <span className="badge badge-neutral"><GitBranch size={11} /> Minor Gap</span>
                        )}
                        {entry.is_continuity_broken && continuitySeverity.get(entry.id) !== "INFO" && (
                          <span className="badge badge-warning"><GitBranch size={11} /> Gap</span>
                        )}
                        {!entry.is_anomalous && !entry.is_continuity_broken && (
                          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditEntry(entry)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-700"
                          title="Correct entry"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuditEntry(entry)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-700"
                          title="View audit trail"
                        >
                          <History size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isHighlighted && flagCards && flagCards.length > 0 && (
                    <tr className="bg-brand-50/70 dark:bg-brand-500/10">
                      <td colSpan={11} className="px-3 pb-3">
                        <FlagReasonBanner cards={flagCards} onDismiss={() => router.replace("/entries")} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {auditEntry && <AuditTrailModal entry={auditEntry} onClose={() => setAuditEntry(null)} />}
      {editEntry && (
        <EditEntryModal
          entry={editEntry}
          vehicles={vehicles}
          drivers={drivers}
          anomalyThresholdPct={settings.anomaly_threshold_pct}
          defaultGapToleranceKm={settings.continuity_gap_tolerance_km}
          onClose={() => setEditEntry(null)}
          onUpdated={() => {
            load();
          }}
        />
      )}
    </div>
  );
}

function EntryCard({
  entry,
  vehicleNo,
  driverName,
  continuitySeverity,
  onEdit,
  onAudit,
  highlighted,
  onHighlightMount,
  onDismissHighlight,
  flagCards,
}: {
  entry: FuelEntry;
  vehicleNo: string;
  driverName: string;
  continuitySeverity: "INFO" | "WARNING" | null;
  onEdit: () => void;
  onAudit: () => void;
  highlighted?: boolean;
  onHighlightMount?: (el: HTMLDivElement | null) => void;
  onDismissHighlight?: () => void;
  flagCards?: FlaggedAlertCard[];
}) {
  return (
    <div
      ref={highlighted ? onHighlightMount : undefined}
      className={
        highlighted
          ? "glass-panel border border-brand-300 bg-brand-50/70 p-3.5 dark:border-brand-500/40 dark:bg-brand-500/10"
          : "glass-panel p-3.5"
      }
    >
      {highlighted && flagCards && flagCards.length > 0 && (
        <div className="mb-3">
          <FlagReasonBanner cards={flagCards} onDismiss={onDismissHighlight} />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white">{vehicleNo}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {formatDate(entry.date)} · {driverName}
            {entry.place ? ` · ${entry.place}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {entry.is_anomalous && entry.anomaly_direction === "WORSE" && (
            <span className="badge badge-worse"><ShieldAlert size={11} /> Worse</span>
          )}
          {entry.is_anomalous && entry.anomaly_direction === "BETTER" && (
            <span className="badge badge-better"><TrendingUp size={11} /> Better</span>
          )}
          {entry.is_continuity_broken && continuitySeverity === "INFO" && (
            <span className="badge badge-neutral"><GitBranch size={11} /> Minor Gap</span>
          )}
          {entry.is_continuity_broken && continuitySeverity !== "INFO" && (
            <span className="badge badge-warning"><GitBranch size={11} /> Gap</span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-slate-50 py-2 text-center dark:bg-slate-800/50">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Onward</p>
          <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">{entry.onward_reading}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Return</p>
          <p className="text-sm tabular-nums text-slate-700 dark:text-slate-200">{entry.return_reading}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">KMS</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{entry.total_kms}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Avg</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{entry.average_kml}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-slate-400">{entry.diesel_consumed} L diesel</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-700"
            title="Correct entry"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={onAudit}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-700"
            title="View audit trail"
          >
            <History size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Shows the same flag message(s) rendered on the Dashboard's Flagged
// Entries cards and the notification bell, inline next to the entry a
// user was sent here to look at.
function FlagReasonBanner({ cards, onDismiss }: { cards: FlaggedAlertCard[]; onDismiss?: () => void }) {
  return (
    <div className="space-y-1.5 rounded-lg bg-white/70 p-2.5 dark:bg-slate-900/40">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
          Why this was flagged
        </p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            title="Dismiss highlight"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {cards.map((card, idx) => {
        const styles = alertKindStyle(card.kind);
        const Icon = styles.icon;
        return (
          <p key={idx} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200">
            <Icon size={13} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
            {card.message}
          </p>
        );
      })}
    </div>
  );
}
