"use client";

import { useMemo } from "react";
import { Navigation, ParkingSquare, Truck, Wrench } from "lucide-react";
import { computeFleetStatus, type VehicleStatusInfo } from "@/lib/fleetStatus";
import type { MaintenanceAlert } from "@/lib/maintenance";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

interface FleetRoadVisualProps {
  vehicles: Vehicle[];
  entries: FuelEntry[];
  drivers: Driver[];
  maintenanceAlerts: MaintenanceAlert[];
}

// Beyond this many, a lane switches to icons + an overflow chip instead of
// one icon per vehicle — the point is a read-at-a-glance scene, not a
// literal count of every truck (a 60-vehicle fleet would otherwise render
// an unreadable wall of icons).
const MAX_ICONS = 8;

const TONE_CLASSES = {
  idle: "text-slate-500 dark:text-slate-400",
  transit: "text-emerald-400",
  service: "text-red-500 dark:text-red-400",
} as const;

function titleFor(info: VehicleStatusInfo, driverMap: Map<string, Driver>): string {
  if (info.status === "ON_TRIP") {
    const driver = info.lastEntry ? driverMap.get(info.lastEntry.driver_id)?.name : null;
    return `${info.vehicle.vehicle_no}${driver ? ` — driven by ${driver}` : ""}`;
  }
  if (info.status === "SERVICE_DUE") {
    return `${info.vehicle.vehicle_no} — ${info.overdueCategories.join(", ")} overdue`;
  }
  return `${info.vehicle.vehicle_no}${
    info.daysSinceLastTrip != null ? ` — idle ${info.daysSinceLastTrip} day${info.daysSinceLastTrip === 1 ? "" : "s"}` : " — no trips logged yet"
  }`;
}

function ZoneHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {icon}
      {label}
      <span className="font-normal normal-case text-slate-400">· {count}</span>
    </div>
  );
}

export default function FleetRoadVisual({ vehicles, entries, drivers, maintenanceAlerts }: FleetRoadVisualProps) {
  const driverMap = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const statuses = useMemo(
    () => computeFleetStatus(vehicles, entries, maintenanceAlerts),
    [vehicles, entries, maintenanceAlerts]
  );

  const idle = statuses.filter((s) => s.status === "IDLE");
  const transit = statuses.filter((s) => s.status === "ON_TRIP");
  const service = statuses.filter((s) => s.status === "SERVICE_DUE");

  if (vehicles.length === 0) {
    return (
      <div className="glass-panel p-6 text-center text-sm text-slate-400">
        No vehicles yet — add one from the Vehicles page to see it here.
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Fleet on the Road</h2>
        <p className="text-xs text-slate-400">Where every vehicle stands right now, at a glance.</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="lg:w-56 lg:shrink-0">
          <ZoneHeader icon={<ParkingSquare size={14} />} label="Idle" count={idle.length} />
          <div className="flex min-h-[88px] flex-wrap content-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            {idle.length === 0 && <p className="text-xs text-slate-400">Nothing idle</p>}
            {idle.slice(0, MAX_ICONS).map((info) => (
              <span key={info.vehicle.id} title={titleFor(info, driverMap)} className={TONE_CLASSES.idle}>
                <Truck size={20} />
              </span>
            ))}
            {idle.length > MAX_ICONS && (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">+{idle.length - MAX_ICONS}</span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <ZoneHeader icon={<Navigation size={14} />} label="On the Road" count={transit.length} />
          <div className="relative flex min-h-[88px] items-center gap-4 overflow-x-auto rounded-xl border border-slate-900/10 bg-slate-800 p-3 shadow-inner dark:border-white/5 dark:bg-slate-950">
            {transit.length > 0 && (
              <div className="pointer-events-none absolute inset-x-3 top-1/2 h-0 -translate-y-1/2 border-t-2 border-dashed border-white/25" />
            )}
            {transit.length === 0 && <p className="relative text-xs text-slate-300">No vehicles on the road right now</p>}
            {transit.slice(0, MAX_ICONS).map((info) => (
              <span
                key={info.vehicle.id}
                title={titleFor(info, driverMap)}
                className={`relative shrink-0 animate-drive ${TONE_CLASSES.transit}`}
              >
                <Truck size={22} />
              </span>
            ))}
            {transit.length > MAX_ICONS && (
              <span className="relative text-xs font-semibold text-slate-300">+{transit.length - MAX_ICONS}</span>
            )}
          </div>
        </div>

        <div className="lg:w-56 lg:shrink-0">
          <ZoneHeader icon={<Wrench size={14} />} label="Service Due" count={service.length} />
          <div className="flex min-h-[88px] flex-wrap content-center gap-2.5 rounded-xl border-2 border-dashed border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10">
            {service.length === 0 && <p className="text-xs text-slate-400">Nothing due</p>}
            {service.slice(0, MAX_ICONS).map((info) => (
              <span key={info.vehicle.id} title={titleFor(info, driverMap)} className={TONE_CLASSES.service}>
                <Truck size={20} />
              </span>
            ))}
            {service.length > MAX_ICONS && (
              <span className="text-xs font-semibold text-red-500 dark:text-red-400">+{service.length - MAX_ICONS}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
