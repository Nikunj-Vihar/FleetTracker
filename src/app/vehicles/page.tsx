"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, History, Loader2, Pencil, Plus, Route, Trash2, Truck } from "lucide-react";
import InlineAddModal from "@/components/InlineAddModal";
import EditVehicleModal from "@/components/EditVehicleModal";
import VehicleAuditTrailModal from "@/components/VehicleAuditTrailModal";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import { useCurrentUser } from "@/lib/auth";
import { deleteVehicle, listEntries, listVehicles, seedLocalSampleData } from "@/lib/store";
import { computeVehicleBaseline } from "@/lib/validation";
import type { FuelEntry, Vehicle } from "@/lib/types";

export default function VehiclesPage() {
  const { user } = useCurrentUser();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [auditVehicle, setAuditVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, e] = await Promise.all([listVehicles(), listEntries()]);
      setVehicles(v.filter((x) => !x.deleted_at));
      setEntries(e);
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vehicles.map((v) => {
          const vehicleEntries = entriesByVehicle.get(v.id) ?? [];
          const trailingBaseline = computeVehicleBaseline(v, vehicleEntries);
          const totalKms = vehicleEntries.reduce((sum, e) => sum + e.total_kms, 0);
          const flaggedCount = vehicleEntries.filter((e) => e.is_anomalous).length;

          return (
            <div key={v.id} className="glass-panel p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                    <Truck size={16} />
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{v.vehicle_no}</p>
                    <p className="text-xs text-slate-400">{v.model || "No model set"}</p>
                  </div>
                </div>
                {flaggedCount > 0 && (
                  <span className="badge badge-worse">{flaggedCount} flagged</span>
                )}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                <p className="flex items-center gap-1"><Route size={12} /> {totalKms.toLocaleString("en-IN")} km logged</p>
                <p className="flex items-center gap-1"><Gauge size={12} /> {vehicleEntries.length} entries</p>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">
                    Baseline: <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {trailingBaseline != null ? `${trailingBaseline} km/l` : "Not yet established"}
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">Tank: {v.tank_capacity} L</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAuditVehicle(v)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                    title="Audit trail"
                  >
                    <History size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingVehicle(v)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
                    title="Correct entry"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingVehicle(v)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    title="Delete vehicle"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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

      {auditVehicle && <VehicleAuditTrailModal vehicle={auditVehicle} onClose={() => setAuditVehicle(null)} />}

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
