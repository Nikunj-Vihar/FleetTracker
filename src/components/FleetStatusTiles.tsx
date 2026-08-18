"use client";

import { useMemo } from "react";
import { CircleDashed, Layers, Truck, Wrench } from "lucide-react";
import { computeFleetStatus } from "@/lib/fleetStatus";
import type { MaintenanceAlert } from "@/lib/maintenance";
import type { FuelEntry, Vehicle } from "@/lib/types";

interface FleetStatusTilesProps {
  vehicles: Vehicle[];
  entries: FuelEntry[];
  maintenanceAlerts: MaintenanceAlert[];
}

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

export default function FleetStatusTiles({ vehicles, entries, maintenanceAlerts }: FleetStatusTilesProps) {
  const statuses = useMemo(
    () => computeFleetStatus(vehicles, entries, maintenanceAlerts),
    [vehicles, entries, maintenanceAlerts]
  );

  const counts = useMemo(() => {
    const c = { ON_TRIP: 0, SERVICE_DUE: 0, IDLE: 0 };
    for (const s of statuses) c[s.status] += 1;
    return c;
  }, [statuses]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <CountTile icon={<Truck size={18} />} label="On Trip Today" value={counts.ON_TRIP} tone="good" />
      <CountTile icon={<CircleDashed size={18} />} label="Idle" value={counts.IDLE} tone="neutral" />
      <CountTile icon={<Wrench size={18} />} label="Service Due" value={counts.SERVICE_DUE} tone="worse" />
      <CountTile icon={<Layers size={18} />} label="Total Fleet" value={vehicles.length} tone="brand" />
    </div>
  );
}
