"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import DailyLogForm from "@/components/DailyLogForm";
import { listDrivers, listEntries, listGarageExpenses, listVehicles, seedLocalSampleData } from "@/lib/store";
import type { Driver, FuelEntry, GarageExpense, Vehicle } from "@/lib/types";

export default function LogPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [garageExpenses, setGarageExpenses] = useState<GarageExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, d, e, ge] = await Promise.all([listVehicles(), listDrivers(), listEntries(), listGarageExpenses()]);
      // Deleted vehicles/drivers shouldn't be selectable for a new trip —
      // listVehicles()/listDrivers() return everything so history keeps
      // displaying correctly elsewhere; this page only needs active ones.
      setVehicles(v.filter((x) => !x.deleted_at));
      setDrivers(d.filter((x) => !x.deleted_at));
      setEntries(e);
      setGarageExpenses(ge);
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
        garageExpenses={garageExpenses}
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
