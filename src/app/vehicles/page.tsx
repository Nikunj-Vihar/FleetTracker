"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, Loader2, Plus, Route, Truck } from "lucide-react";
import InlineAddModal from "@/components/InlineAddModal";
import { listEntries, listVehicles, seedLocalSampleData, updateVehicle } from "@/lib/store";
import { computeVehicleBaseline } from "@/lib/validation";
import type { FuelEntry, Vehicle } from "@/lib/types";

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ expected_avg: string; tank_capacity: string }>({ expected_avg: "", tank_capacity: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, e] = await Promise.all([listVehicles(), listEntries()]);
      setVehicles(v);
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

  function startEdit(v: Vehicle) {
    setEditingId(v.id);
    setDraft({ expected_avg: v.expected_avg != null ? String(v.expected_avg) : "", tank_capacity: String(v.tank_capacity) });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const updated = await updateVehicle(id, {
        expected_avg: draft.expected_avg ? Number(draft.expected_avg) : null,
        tank_capacity: Number(draft.tank_capacity) || 300,
      });
      setVehicles((prev) => prev.map((v) => (v.id === id ? updated : v)));
      setEditingId(null);
    } finally {
      setSaving(false);
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
          const isEditing = editingId === v.id;

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

              {isEditing ? (
                <div className="space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                  <div>
                    <label className="label-text">Expected Avg (km/l)</label>
                    <input
                      className="input-field"
                      type="number"
                      step="0.1"
                      value={draft.expected_avg}
                      onChange={(e) => setDraft((d) => ({ ...d, expected_avg: e.target.value }))}
                      placeholder="Auto from entries"
                    />
                  </div>
                  <div>
                    <label className="label-text">Tank Capacity (L)</label>
                    <input
                      className="input-field"
                      type="number"
                      value={draft.tank_capacity}
                      onChange={(e) => setDraft((d) => ({ ...d, tank_capacity: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    <button type="button" className="btn-primary" disabled={saving} onClick={() => saveEdit(v.id)}>Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">
                      Baseline: <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {trailingBaseline != null ? `${trailingBaseline} km/l` : "Not yet established"}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">Tank: {v.tank_capacity} L</p>
                  </div>
                  <button type="button" onClick={() => startEdit(v)} className="text-xs font-medium text-brand-600 hover:underline">
                    Edit
                  </button>
                </div>
              )}
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
    </div>
  );
}
