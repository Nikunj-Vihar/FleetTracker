"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import FleetSummaryCards from "@/components/FleetSummaryCards";
import FleetStatusTiles from "@/components/FleetStatusTiles";
import FleetRoadVisual from "@/components/FleetRoadVisual";
import BaselineTrendChart from "@/components/BaselineTrendChart";
import FlaggedAlertsList from "@/components/FlaggedAlertsList";
import MaintenanceAlertsList from "@/components/MaintenanceAlertsList";
import { getSettings, listDrivers, listEntries, listGarageExpenses, listVehicles, seedLocalSampleData } from "@/lib/store";
import { buildDriverTrend, buildVehicleTrend, DEFAULT_GAP_TOLERANCE_KM } from "@/lib/validation";
import { computeMaintenanceAlerts, DEFAULT_MAINTENANCE_INTERVALS } from "@/lib/maintenance";
import { computeUnloggedMileage } from "@/lib/unloggedMileage";
import UnloggedMileageList from "@/components/UnloggedMileageList";
import { cn } from "@/lib/utils";
import type { Driver, FuelEntry, GarageExpense, Settings, Vehicle } from "@/lib/types";

export default function DashboardPage() {
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [garageExpenses, setGarageExpenses] = useState<GarageExpense[]>([]);
  const [settings, setSettings] = useState<Settings>({
    fuel_rate_inr: 95.5,
    anomaly_threshold_pct: 8,
    maintenance_intervals: DEFAULT_MAINTENANCE_INTERVALS,
    continuity_gap_tolerance_km: DEFAULT_GAP_TOLERANCE_KM,
  });
  const [loading, setLoading] = useState(true);

  const [trendMode, setTrendMode] = useState<"vehicle" | "driver">("vehicle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [e, v, d, ge, s] = await Promise.all([
        listEntries(),
        listVehicles(),
        listDrivers(),
        listGarageExpenses(),
        getSettings(),
      ]);
      setEntries(e);
      setVehicles(v);
      setDrivers(d);
      setGarageExpenses(ge);
      setSettings(s);
      setSelectedId(v[0]?.id ?? null);
      setLoading(false);
    })();
  }, []);

  const maintenanceAlerts = useMemo(
    () => computeMaintenanceAlerts(vehicles, garageExpenses, entries, settings.maintenance_intervals),
    [vehicles, garageExpenses, entries, settings.maintenance_intervals]
  );

  // Status board reflects the fleet as it is today, so a soft-deleted
  // vehicle (e.g. sold or retired) shouldn't still show up as "Idle".
  const activeVehicles = useMemo(() => vehicles.filter((v) => !v.deleted_at), [vehicles]);

  const unloggedMileage = useMemo(() => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const sinceIso = startOfMonth.toISOString().slice(0, 10);
    return computeUnloggedMileage(activeVehicles, entries, sinceIso);
  }, [activeVehicles, entries]);

  useEffect(() => {
    if (trendMode === "vehicle" && vehicles.length > 0 && !vehicles.some((v) => v.id === selectedId)) {
      setSelectedId(vehicles[0].id);
    }
    if (trendMode === "driver" && drivers.length > 0 && !drivers.some((d) => d.id === selectedId)) {
      setSelectedId(drivers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendMode, vehicles, drivers]);

  const trendPoints = useMemo(() => {
    if (!selectedId) return [];
    if (trendMode === "vehicle") {
      const vehicle = vehicles.find((v) => v.id === selectedId);
      if (!vehicle) return [];
      const vehicleEntries = entries
        .filter((e) => e.vehicle_id === selectedId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      return buildVehicleTrend(vehicle, vehicleEntries, settings.anomaly_threshold_pct);
    }
    const driverEntries = entries
      .filter((e) => e.driver_id === selectedId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return buildDriverTrend(driverEntries, settings.anomaly_threshold_pct);
  }, [trendMode, selectedId, entries, vehicles, settings.anomaly_threshold_pct]);

  const chartTitle =
    trendMode === "vehicle"
      ? `${vehicles.find((v) => v.id === selectedId)?.vehicle_no ?? "Vehicle"} — Average km/l trend`
      : `${drivers.find((d) => d.id === selectedId)?.name ?? "Driver"} — Average km/l trend`;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Fleet Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Live overview of fuel usage, cost, and flagged entries.</p>
      </div>

      <FleetStatusTiles vehicles={activeVehicles} entries={entries} maintenanceAlerts={maintenanceAlerts} />

      <FleetSummaryCards entries={entries} fuelRateInr={settings.fuel_rate_inr} />

      <FleetRoadVisual
        vehicles={activeVehicles}
        entries={entries}
        drivers={drivers}
        maintenanceAlerts={maintenanceAlerts}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => setTrendMode("vehicle")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition",
                  trendMode === "vehicle" ? "bg-brand-600 text-white" : "text-slate-500 dark:text-slate-400"
                )}
              >
                By Vehicle
              </button>
              <button
                onClick={() => setTrendMode("driver")}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition",
                  trendMode === "driver" ? "bg-brand-600 text-white" : "text-slate-500 dark:text-slate-400"
                )}
              >
                By Driver
              </button>
            </div>
            <select
              className="input-field w-auto"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {(trendMode === "vehicle" ? vehicles : drivers).map((item) => (
                <option key={item.id} value={item.id}>
                  {"vehicle_no" in item ? item.vehicle_no : item.name}
                </option>
              ))}
            </select>
          </div>
          <BaselineTrendChart points={trendPoints} title={chartTitle} />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Flagged Entries</h2>
          <FlaggedAlertsList
            entries={entries}
            vehicles={vehicles}
            drivers={drivers}
            defaultGapToleranceKm={settings.continuity_gap_tolerance_km}
            limit={8}
          />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Maintenance Due</h2>
        <MaintenanceAlertsList alerts={maintenanceAlerts} vehicles={vehicles} />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Unlogged Mileage This Month</h2>
        <UnloggedMileageList summaries={unloggedMileage} />
      </div>
    </div>
  );
}
