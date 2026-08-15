"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, History, Loader2, Pencil, Phone, Plus, Trash2, User } from "lucide-react";
import InlineAddModal from "@/components/InlineAddModal";
import EditDriverModal from "@/components/EditDriverModal";
import DriverAuditTrailModal from "@/components/DriverAuditTrailModal";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import { useCurrentUser } from "@/lib/auth";
import { deleteDriver, listDrivers, listEntries, listVehicles, seedLocalSampleData } from "@/lib/store";
import { computeFleetAverage } from "@/lib/validation";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

export default function DriversPage() {
  const { user } = useCurrentUser();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [auditDriver, setAuditDriver] = useState<Driver | null>(null);
  const [deletingDriver, setDeletingDriver] = useState<Driver | null>(null);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [d, e, v] = await Promise.all([listDrivers(), listEntries(), listVehicles()]);
      setDrivers(d.filter((x) => !x.deleted_at));
      setEntries(e);
      setVehicles(v);
      setLoading(false);
    })();
  }, []);

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const fleetAvg = useMemo(() => computeFleetAverage(entries), [entries]);

  const driverStats = useMemo(() => {
    return drivers
      .map((driver) => {
        const driverEntries = entries.filter((e) => e.driver_id === driver.id);
        const avg = computeFleetAverage(driverEntries);
        const flaggedCount = driverEntries.filter((e) => e.is_anomalous).length;
        const vehicleNos = Array.from(new Set(driverEntries.map((e) => vehicleMap.get(e.vehicle_id)?.vehicle_no).filter(Boolean)));
        const deviationFromFleet = avg != null && fleetAvg ? ((avg - fleetAvg) / fleetAvg) * 100 : null;
        return { driver, avg, flaggedCount, vehicleNos, entryCount: driverEntries.length, deviationFromFleet };
      })
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [drivers, entries, vehicleMap, fleetAvg]);

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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Drivers</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Efficiency ratings — isolates driver behavior from vehicle-level mechanical issues.
          </p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16} /> Add Driver
        </button>
      </div>

      {driverStats.length === 0 ? (
        <div className="glass-panel px-3 py-10 text-center text-sm text-slate-400">No drivers yet.</div>
      ) : (
        <>
          {/* Card list — below md (also covers the 640-767px tablet range) */}
          <div className="space-y-2 md:hidden">
            {driverStats.map((stat) => (
              <DriverCard
                key={stat.driver.id}
                {...stat}
                onEdit={() => setEditingDriver(stat.driver)}
                onAudit={() => setAuditDriver(stat.driver)}
                onDelete={() => setDeletingDriver(stat.driver)}
              />
            ))}
          </div>

          {/* Full table — md and up, matching Navbar's own mobile/desktop breakpoint */}
          <div className="glass-panel hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="px-3 py-2.5">Driver</th>
                  <th className="px-3 py-2.5">Vehicles Driven</th>
                  <th className="px-3 py-2.5 text-right">Entries</th>
                  <th className="px-3 py-2.5 text-right">Average km/l</th>
                  <th className="px-3 py-2.5 text-right">vs Fleet Avg</th>
                  <th className="px-3 py-2.5 text-right">Flagged</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {driverStats.map(({ driver, avg, flaggedCount, vehicleNos, entryCount, deviationFromFleet }) => (
                  <tr key={driver.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                          <User size={14} />
                        </span>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{driver.name}</p>
                          {driver.phone && (
                            <p className="flex items-center gap-1 text-xs text-slate-400"><Phone size={10} /> {driver.phone}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                      {vehicleNos.length ? vehicleNos.join(", ") : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{entryCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                      {avg != null ? `${avg} km/l` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {deviationFromFleet != null ? (
                        <span className={deviationFromFleet < -8 ? "font-medium text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}>
                          {deviationFromFleet > 0 ? "+" : ""}
                          {deviationFromFleet.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {flaggedCount > 0 ? (
                        <span className="badge badge-worse ml-auto w-fit"><AlertTriangle size={11} /> {flaggedCount}</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setAuditDriver(driver)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="Audit trail"
                        >
                          <History size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDriver(driver)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="Correct entry"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingDriver(driver)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          title="Delete driver"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAdd && (
        <InlineAddModal
          type="driver"
          onClose={() => setShowAdd(false)}
          onCreated={(record) => {
            setDrivers((prev) => [...prev, record as Driver]);
            setShowAdd(false);
          }}
        />
      )}

      {editingDriver && (
        <EditDriverModal
          driver={editingDriver}
          onClose={() => setEditingDriver(null)}
          onUpdated={(updated) => {
            setDrivers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setEditingDriver(null);
          }}
        />
      )}

      {auditDriver && <DriverAuditTrailModal driver={auditDriver} onClose={() => setAuditDriver(null)} />}

      {deletingDriver && (
        <ConfirmDeleteModal
          title="Delete Driver"
          description={`This removes "${deletingDriver.name}" from active lists and dropdowns. Their trip history is kept and still shown correctly — this can be undone from Settings → Recently Deleted.`}
          confirmationLabel={`I understand — remove "${deletingDriver.name}" from active use.`}
          onClose={() => setDeletingDriver(null)}
          onConfirm={async (reason) => {
            await deleteDriver(deletingDriver.id, { deletedBy: user?.label ?? "Unknown", reason });
            setDrivers((prev) => prev.filter((d) => d.id !== deletingDriver.id));
            setDeletingDriver(null);
          }}
        />
      )}
    </div>
  );
}

function DriverCard({
  driver,
  avg,
  flaggedCount,
  vehicleNos,
  entryCount,
  deviationFromFleet,
  onEdit,
  onAudit,
  onDelete,
}: {
  driver: Driver;
  avg: number | null;
  flaggedCount: number;
  vehicleNos: (string | undefined)[];
  entryCount: number;
  deviationFromFleet: number | null;
  onEdit: () => void;
  onAudit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="glass-panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <User size={15} />
          </span>
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{driver.name}</p>
            {driver.phone && (
              <p className="flex items-center gap-1 text-xs text-slate-400"><Phone size={10} /> {driver.phone}</p>
            )}
          </div>
        </div>
        {flaggedCount > 0 && (
          <span className="badge badge-worse shrink-0"><AlertTriangle size={11} /> {flaggedCount}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-50 py-2 text-center dark:bg-slate-800/50">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Entries</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{entryCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Avg km/l</p>
          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{avg ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">vs Fleet</p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              deviationFromFleet != null && deviationFromFleet < -8
                ? "text-red-600 dark:text-red-400"
                : "text-slate-900 dark:text-white"
            }`}
          >
            {deviationFromFleet != null ? `${deviationFromFleet > 0 ? "+" : ""}${deviationFromFleet.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      <p className="mt-2 truncate text-xs text-slate-400">
        Vehicles: {vehicleNos.length ? vehicleNos.join(", ") : "—"}
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onAudit} className="btn-secondary px-2.5 py-1.5 text-xs">
          <History size={12} /> Audit
        </button>
        <button type="button" onClick={onEdit} className="btn-secondary px-2.5 py-1.5 text-xs">
          <Pencil size={12} /> Correct
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
