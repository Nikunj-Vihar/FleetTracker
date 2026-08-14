"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import DailyLogForm from "@/components/DailyLogForm";
import { listDrivers, listEntries, listVehicles, seedLocalSampleData } from "@/lib/store";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

export default function LogPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, d, e] = await Promise.all([listVehicles(), listDrivers(), listEntries()]);
      setVehicles(v);
      setDrivers(d);
      setEntries(e);
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
        entries={entries}
        onVehicleCreated={(v) => setVehicles((prev) => [...prev, v])}
        onDriverCreated={(d) => setDrivers((prev) => [...prev, d])}
        onEntryCreated={(entry) => {
          // Keeps vehicle/driver pairing suggestions current for the next
          // entry in this session, without a full page reload.
          setEntries((prev) => [...prev, entry]);
        }}
      />
    </div>
  );
}
