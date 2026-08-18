"use client";

import { useMemo } from "react";
import { CircleDashed, Layers, Truck, Wrench } from "lucide-react";
import { computeFleetStatus, type VehicleStatus } from "@/lib/fleetStatus";
import type { MaintenanceAlert } from "@/lib/maintenance";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

interface FleetStatusBoardProps {
  vehicles: Vehicle[];
  entries: FuelEntry[];
  drivers: Driver[];
  maintenanceAlerts: MaintenanceAlert[];
}

const STATUS_META: Record<VehicleStatus, { label: string; badge: string; dot: string }> = {
  ON_TRIP: { label: "On Trip Today", badge: "badge-good", dot: "bg-emerald-500" },
  SERVICE_DUE: { label: "Service Due", badge: "badge-worse", dot: "bg-red-500" },
  IDLE: { label: "Idle", badge: "badge-neutral", dot: "bg-slate-400" },
};

function CountTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "good" | "worse" | "neutral" | "brand";
}) {
  const toneClasses: Record<typeof tone, string> = {
    good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    worse: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
    brand: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  };
  return (
    <div className="glass-panel flex items-center gap-3 p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs font-medium uppercase leading-tight tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function FleetStatusBoard({ vehicles, entries, drivers, maintenanceAlerts }: FleetStatusBoardProps) {
  const driverMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  const statuses = useMemo(
    () => computeFleetStatus(vehicles, entries, maintenanceAlerts),
    [vehicles, entries, maintenanceAlerts]
  );

  const counts = useMemo(() => {
    const c = { ON_TRIP: 0, SERVICE_DUE: 0, IDLE: 0 };
    for (const s of statuses) c[s.status] += 1;
    return c;
  }, [statuses]);

  if (vehicles.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-slate-400">
        No vehicles yet — add one from the Vehicles page to see live fleet status here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountTile icon={<Truck size={18} />} label="On Trip Today" value={counts.ON_TRIP} tone="good" />
        <CountTile icon={<CircleDashed size={18} />} label="Idle" value={counts.IDLE} tone="neutral" />
        <CountTile icon={<Wrench size={18} />} label="Service Due" value={counts.SERVICE_DUE} tone="worse" />
        <CountTile icon={<Layers size={18} />} label="Total Fleet" value={vehicles.length} tone="brand" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {statuses.map(({ vehicle, status, lastEntry, daysSinceLastTrip, overdueCategories }) => {
          const meta = STATUS_META[status];
          const driverName = lastEntry ? driverMap.get(lastEntry.driver_id)?.name : null;

          let detail: string;
          if (status === "SERVICE_DUE") {
            detail = `${overdueCategories.join(", ")} overdue`;
          } else if (status === "ON_TRIP") {
            detail = driverName ? `Driver: ${driverName}${lastEntry?.place ? ` · ${lastEntry.place}` : ""}` : "Trip logged today";
          } else if (lastEntry && daysSinceLastTrip != null) {
            detail = `Last trip: ${daysSinceLastTrip === 0 ? "today" : `${daysSinceLastTrip} day${daysSinceLastTrip === 1 ? "" : "s"} ago`}`;
          } else {
            detail = "No trips logged yet";
          }

          return (
            <div key={vehicle.id} className="glass-panel flex items-start gap-3 p-4">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                <Truck size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{vehicle.vehicle_no}</p>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                </div>
                {vehicle.model && <p className="truncate text-xs text-slate-400">{vehicle.model}</p>}
                <span className={`badge ${meta.badge} mt-2`}>{meta.label}</span>
                <p className="mt-1.5 truncate text-xs text-slate-500 dark:text-slate-400">{detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
