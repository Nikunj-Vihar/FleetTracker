"use client";

import { Download } from "lucide-react";
import { downloadCsv, entriesToCsv } from "@/lib/csv";
import type { Driver, FuelEntry, Vehicle } from "@/lib/types";

export default function CsvExportButton({
  entries,
  vehicles,
  drivers,
}: {
  entries: FuelEntry[];
  vehicles: Vehicle[];
  drivers: Driver[];
}) {
  function handleExport() {
    const csv = entriesToCsv(entries, vehicles, drivers);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`fleet-fuel-log-${stamp}.csv`, csv);
  }

  return (
    <button type="button" onClick={handleExport} className="btn-secondary" disabled={entries.length === 0}>
      <Download size={16} /> Export CSV
    </button>
  );
}
