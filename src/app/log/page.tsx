"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import DailyLogForm from "@/components/DailyLogForm";
import { listDrivers, listVehicles, seedLocalSampleData } from "@/lib/store";
import type { Driver, Vehicle } from "@/lib/types";

export default function LogPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, d] = await Promise.all([listVehicles(), listDrivers()]);
      setVehicles(v);
      setDrivers(d);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <DailyLogForm
        vehicles={vehicles}
        drivers={drivers}
        onVehicleCreated={(v) => setVehicles((prev) => [...prev, v])}
        onDriverCreated={(d) => setDrivers((prev) => [...prev, d])}
        onEntryCreated={() => {
          /* form shows its own success state; entries list refreshes on its own page */
        }}
      />
    </div>
  );
}
