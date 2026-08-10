"use client";

import { useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { listAuditLogs } from "@/lib/store";
import type { AuditLogRecord, FuelEntry } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  date: "Date",
  place: "Place",
  vehicle_id: "Vehicle",
  driver_id: "Driver",
  onward_reading: "Onward Reading",
  return_reading: "Return Reading",
  diesel_consumed: "Diesel Consumed",
  notes: "Notes",
  total_kms: "Total KMS (recomputed)",
  average_kml: "Average km/l (recomputed)",
};

export default function AuditTrailModal({ entry, onClose }: { entry: FuelEntry; onClose: () => void }) {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAuditLogs(entry.id).then((l) => {
      setLogs(l);
      setLoading(false);
    });
  }, [entry.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="glass-panel-solid max-h-[80vh] w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <History size={16} className="text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Audit Trail</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-slate-400">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No corrections yet — this entry is exactly as originally logged.
            </p>
          ) : (
            <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
              {logs.map((log) => (
                <li key={log.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-600" />
                  <p className="text-xs text-slate-400">
                    {new Date(log.created_at).toLocaleString("en-IN")} · {log.changed_by ?? "Unknown"}
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-100">
                    <span className="font-medium">{FIELD_LABELS[log.field_name] ?? log.field_name}</span>{" "}
                    changed from <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-700">{log.old_value ?? "—"}</span>{" "}
                    to <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-700">{log.new_value ?? "—"}</span>
                  </p>
                  {log.reason && <p className="text-xs italic text-slate-500 dark:text-slate-400">Reason: {log.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
