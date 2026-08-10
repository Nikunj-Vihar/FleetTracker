"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Phone, Plus, User } from "lucide-react";
import InlineAddModal from "@/components/InlineAddModal";
import { listDrivers, listEntries, listVehicles, seedLocalSampleData } from "@/lib/store";
import { computeFleetAverage } from "@/lib/validation";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [d, e, v] = await Promise.all([listDrivers(), listEntries(), listVehicles()]);
      setDrivers(d);
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

      <div className="glass-panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="px-3 py-2.5">Driver</th>
              <th className="px-3 py-2.5">Vehicles Driven</th>
              <th className="px-3 py-2.5 text-right">Entries</th>
              <th className="px-3 py-2.5 text-right">Average km/l</th>
              <th className="px-3 py-2.5 text-right">vs Fleet Avg</th>
              <th className="px-3 py-2.5 text-right">Flagged</th>
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
              </tr>
            ))}
            {driverStats.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">No drivers yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}
