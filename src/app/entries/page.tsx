"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitBranch, History, Loader2, Pencil, Search, ShieldAlert, TrendingUp } from "lucide-react";
import CsvExportButton from "@/components/CsvExportButton";
import AuditTrailModal from "@/components/AuditTrailModal";
import EditEntryModal from "@/components/EditEntryModal";
import { getSettings, listDrivers, listEntries, listVehicles, seedLocalSampleData } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import type { Driver, FuelEntry, Settings, Vehicle } from "@/lib/types";

export default function EntriesPage() {
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [settings, setSettings] = useState<Settings>({ fuel_rate_inr: 95.5, anomaly_threshold_pct: 8 });
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

      <div className="glass-panel overflow-x-auto">
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
            {filtered.map((entry) => (
              <tr key={entry.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
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
                    {entry.is_continuity_broken && (
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
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-sm text-slate-400">
                  <AlertTriangle size={20} className="mx-auto mb-2 opacity-40" />
                  No entries match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {auditEntry && <AuditTrailModal entry={auditEntry} onClose={() => setAuditEntry(null)} />}
      {editEntry && (
        <EditEntryModal
          entry={editEntry}
          vehicles={vehicles}
          drivers={drivers}
          anomalyThresholdPct={settings.anomaly_threshold_pct}
          onClose={() => setEditEntry(null)}
          onUpdated={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
