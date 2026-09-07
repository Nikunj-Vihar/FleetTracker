"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge, History, Loader2, Pencil, Plus, Route, Trash2, Truck } from "lucide-react";
import InlineAddModal from "@/components/InlineAddModal";
import EditVehicleModal from "@/components/EditVehicleModal";
import AuditLogTimeline from "@/components/AuditLogTimeline";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import { useCurrentUser } from "@/lib/auth";
import {
  deleteVehicle,
  getSettings,
  listEntries,
  listGarageExpenses,
  listVehicleAuditLogs,
  listVehicles,
  seedLocalSampleData,
} from "@/lib/store";
import { computeFleetAverage, computeVehicleBaseline } from "@/lib/validation";
import { computeMaintenanceAlerts, DEFAULT_MAINTENANCE_INTERVALS } from "@/lib/maintenance";
import type { FuelEntry, GarageExpense, MaintenanceIntervals, Vehicle } from "@/lib/types";

const VEHICLE_FIELD_LABELS: Record<string, string> = {
  vehicle_no: "Vehicle No",
  model: "Model",
  starting_odometer: "Starting Odometer",
  expected_avg: "Expected Avg (km/l)",
  tank_capacity: "Tank Capacity (L)",
  deleted_at: "Deleted",
};

type ServiceStatus = "OK" | "DUE_SOON" | "OVERDUE";

export default function VehiclesPage() {
  const { user } = useCurrentUser();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [garageExpenses, setGarageExpenses] = useState<GarageExpense[]>([]);
  const [maintenanceIntervals, setMaintenanceIntervals] = useState<MaintenanceIntervals>(DEFAULT_MAINTENANCE_INTERVALS);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [auditVehicle, setAuditVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, e, ge, settings] = await Promise.all([listVehicles(), listEntries(), listGarageExpenses(), getSettings()]);
      setVehicles(v.filter((x) => !x.deleted_at));
      setEntries(e);
      setGarageExpenses(ge);
      setMaintenanceIntervals(settings.maintenance_intervals);
      setLoading(false);
    })();
  }, []);

  const entriesByVehicle = useMemo(() => {
    const map = new Map<string, FuelEntry[]>();
    for (const e of entries) {
      const list = map.get(e.vehicle_id) ?? [];
      list.push(e);
      map.set(e.vehicle_id, list);
    }
    return map;
  }, [entries]);

  const maintenanceAlerts = useMemo(
    () => computeMaintenanceAlerts(vehicles, garageExpenses, entries, maintenanceIntervals),
    [vehicles, garageExpenses, entries, maintenanceIntervals]
  );

  const vehicleStats = useMemo(() => {
    return vehicles.map((vehicle) => {
      const vehicleEntries = entriesByVehicle.get(vehicle.id) ?? [];
      const avg = computeFleetAverage(vehicleEntries);
      const baseline = computeVehicleBaseline(vehicle, vehicleEntries);
      const deviationFromBaseline = avg != null && baseline ? ((avg - baseline) / baseline) * 100 : null;
      const flaggedCount = vehicleEntries.filter((e) => e.is_anomalous).length;
      const totalKms = vehicleEntries.reduce((sum, e) => sum + e.total_kms, 0);

      const vehicleAlerts = maintenanceAlerts.filter((a) => a.vehicleId === vehicle.id);
      const serviceStatus: ServiceStatus = vehicleAlerts.some((a) => a.status === "OVERDUE")
        ? "OVERDUE"
        : vehicleAlerts.some((a) => a.status === "DUE_SOON")
          ? "DUE_SOON"
          : "OK";

      return { vehicle, avg, baseline, deviationFromBaseline, flaggedCount, totalKms, entryCount: vehicleEntries.length, serviceStatus };
    });
  }, [vehicles, entriesByVehicle, maintenanceAlerts]);

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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Vehicles</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Fleet master list and baseline configuration.</p>
        </div>
        <button type="button" onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus size={16} /> Add Vehicle
        </button>
      </div>

      {vehicleStats.length === 0 ? (
        <div className="glass-panel px-3 py-10 text-center text-sm text-slate-400">No vehicles yet.</div>
      ) : (
        <>
          {/* Card list — below md (also covers the 640-767px tablet range) */}
          <div className="space-y-2 md:hidden">
            {vehicleStats.map((stat) => (
              <VehicleCard
                key={stat.vehicle.id}
                {...stat}
                onEdit={() => setEditingVehicle(stat.vehicle)}
                onAudit={() => setAuditVehicle(stat.vehicle)}
                onDelete={() => setDeletingVehicle(stat.vehicle)}
              />
            ))}
          </div>

          {/* Full table — md and up, matching Navbar's own mobile/desktop breakpoint */}
          <div className="glass-panel hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="px-3 py-2.5">Vehicle</th>
                  <th className="px-3 py-2.5 text-right">Entries</th>
                  <th className="px-3 py-2.5 text-right">Avg km/l</th>
                  <th className="px-3 py-2.5 text-right">vs Baseline</th>
                  <th className="px-3 py-2.5">Service</th>
                  <th className="px-3 py-2.5 text-right">Flagged</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicleStats.map(({ vehicle, avg, baseline, deviationFromBaseline, flaggedCount, entryCount, serviceStatus }) => (
                  <tr key={vehicle.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                          <Truck size={14} />
                        </span>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{vehicle.vehicle_no}</p>
                          <p className="text-xs text-slate-400">{vehicle.model || "No model set"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{entryCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                      {avg != null ? `${avg} km/l` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {deviationFromBaseline != null ? (
                        <span className={deviationFromBaseline < -8 ? "font-medium text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}>
                          {deviationFromBaseline > 0 ? "+" : ""}
                          {deviationFromBaseline.toFixed(1)}%
                        </span>
                      ) : baseline != null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">No baseline yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ServiceBadge status={serviceStatus} />
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
                          onClick={() => setAuditVehicle(vehicle)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="Audit trail"
                        >
                          <History size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingVehicle(vehicle)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="Correct entry"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingVehicle(vehicle)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          title="Delete vehicle"
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
          type="vehicle"
          onClose={() => setShowAdd(false)}
          onCreated={(record) => {
            setVehicles((prev) => [...prev, record as Vehicle]);
            setShowAdd(false);
          }}
        />
      )}

      {editingVehicle && (
        <EditVehicleModal
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onUpdated={(updated) => {
            setVehicles((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
            setEditingVehicle(null);
          }}
        />
      )}

      {auditVehicle && (
        <AuditLogTimeline
          title={`Audit Trail — ${auditVehicle.vehicle_no}`}
          fieldLabels={VEHICLE_FIELD_LABELS}
          fetchLogs={() => listVehicleAuditLogs(auditVehicle.id)}
          emptyMessage="No corrections yet — this vehicle is exactly as originally added."
          onClose={() => setAuditVehicle(null)}
        />
      )}

      {deletingVehicle && (
        <ConfirmDeleteModal
          title="Delete Vehicle"
          description={`This removes "${deletingVehicle.vehicle_no}" from active lists and dropdowns. Its trip and expense history is kept and still shown correctly — this can be undone from Settings → Recently Deleted.`}
          confirmationLabel={`I understand — remove "${deletingVehicle.vehicle_no}" from active use.`}
          onClose={() => setDeletingVehicle(null)}
          onConfirm={async (reason) => {
            await deleteVehicle(deletingVehicle.id, { deletedBy: user?.label ?? "Unknown", reason });
            setVehicles((prev) => prev.filter((v) => v.id !== deletingVehicle.id));
            setDeletingVehicle(null);
          }}
        />
      )}
    </div>
  );
}

function ServiceBadge({ status }: { status: ServiceStatus }) {
  if (status === "OVERDUE") return <span className="badge badge-worse w-fit">Overdue</span>;
  if (status === "DUE_SOON") return <span className="badge badge-warning w-fit">Due soon</span>;
  return <span className="badge badge-good w-fit">Good</span>;
}

function VehicleCard({
  vehicle,
  avg,
  baseline,
  deviationFromBaseline,
  flaggedCount,
  totalKms,
  entryCount,
  serviceStatus,
  onEdit,
  onAudit,
  onDelete,
}: {
  vehicle: Vehicle;
  avg: number | null;
  baseline: number | null;
  deviationFromBaseline: number | null;
  flaggedCount: number;
  totalKms: number;
  entryCount: number;
  serviceStatus: ServiceStatus;
  onEdit: () => void;
  onAudit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="glass-panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <Truck size={15} />
          </span>
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{vehicle.vehicle_no}</p>
            <p className="text-xs text-slate-400">{vehicle.model || "No model set"}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <ServiceBadge status={serviceStatus} />
          {flaggedCount > 0 && (
            <span className="badge badge-worse"><AlertTriangle size={11} /> {flaggedCount}</span>
          )}
        </div>
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
          <p className="text-[10px] uppercase tracking-wide text-slate-400">vs Baseline</p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              deviationFromBaseline != null && deviationFromBaseline < -8
                ? "text-red-600 dark:text-red-400"
                : "text-slate-900 dark:text-white"
            }`}
          >
            {deviationFromBaseline != null ? `${deviationFromBaseline > 0 ? "+" : ""}${deviationFromBaseline.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1"><Route size={12} /> {totalKms.toLocaleString("en-IN")} km logged</span>
        <span className="flex items-center gap-1">
          <Gauge size={12} /> Baseline: {baseline != null ? `${baseline} km/l` : "—"} · Tank {vehicle.tank_capacity} L
        </span>
      </div>

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
