"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Loader2, Pencil, Receipt, Route, Search } from "lucide-react";
import FleetExpenseForm from "@/components/FleetExpenseForm";
import EditFleetExpenseModal from "@/components/EditFleetExpenseModal";
import FleetExpenseAuditTrailModal from "@/components/FleetExpenseAuditTrailModal";
import { listFleetExpenses, listVehicles, seedLocalSampleData } from "@/lib/store";
import { FLEET_EXPENSE_CATEGORIES } from "@/lib/fleetExpenses";
import { formatDate, formatInr } from "@/lib/utils";
import type { FleetExpense, Vehicle } from "@/lib/types";

export default function FleetExpensesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [expenses, setExpenses] = useState<FleetExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tripFilter, setTripFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingExpense, setEditingExpense] = useState<FleetExpense | null>(null);
  const [auditExpense, setAuditExpense] = useState<FleetExpense | null>(null);

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, e] = await Promise.all([listVehicles(), listFleetExpenses()]);
      setVehicles(v);
      setExpenses(e);
      setLoading(false);
    })();
  }, []);

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  // vehicles stays the full (incl. deleted) list so historical expenses and
  // the filter dropdown keep showing a since-deleted vehicle's plate number
  // correctly; only the create form should offer active ones as new choices.
  const activeVehicles = useMemo(() => vehicles.filter((v) => !v.deleted_at), [vehicles]);

  // Distinct trip references actually in use, so the filter is a pick-list
  // rather than free text the user has to retype exactly.
  const tripReferences = useMemo(() => {
    const refs = new Set<string>();
    for (const e of expenses) if (e.trip_reference) refs.add(e.trip_reference);
    return [...refs].sort();
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses
      .filter((e) => vehicleFilter === "all" || e.vehicle_id === vehicleFilter)
      .filter((e) => categoryFilter === "all" || e.category === categoryFilter)
      .filter((e) => tripFilter === "all" || e.trip_reference === tripFilter)
      .filter((e) => {
        if (!q) return true;
        return (
          e.description.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.trip_reference ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, vehicleFilter, categoryFilter, tripFilter, search]);

  // Doubles as a per-trip subtotal: selecting a specific Trip Ref narrows
  // `filtered` down to just that trip's lines, so this total becomes the
  // trip's total with no separate rollup UI needed.
  const totalAmount = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Fleet Expenses</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tolls, RTO/checkpost fees, loading &amp; unloading, driver allowance — per-trip operational costs, separate
          from garage/maintenance billing.
        </p>
      </div>

      <FleetExpenseForm
        vehicles={activeVehicles}
        onVehicleCreated={(v) => setVehicles((prev) => [...prev, v])}
        onExpenseCreated={(expense) => setExpenses((prev) => [...prev, expense])}
      />

      <div className="glass-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input-field w-56 pl-8"
                placeholder="Search description, category, trip ref..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input-field w-40" value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)}>
              <option value="all">All vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vehicle_no}
                </option>
              ))}
            </select>
            <select className="input-field w-44" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {FLEET_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {tripReferences.length > 0 && (
              <select className="input-field w-40" value={tripFilter} onChange={(e) => setTripFilter(e.target.value)}>
                <option value="all">All trips</option>
                {tripReferences.map((ref) => (
                  <option key={ref} value={ref}>
                    {ref}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            <Receipt size={14} className="text-brand-600" />
            {tripFilter !== "all" ? "Trip total" : "Total"}: {formatInr(totalAmount)} ({filtered.length} records)
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-slate-400">No fleet expenses logged yet.</div>
        ) : (
          <>
            {/* Card list — below md (also covers the 640-767px tablet range, where a full data table wouldn't fit) */}
            <div className="space-y-2 md:hidden">
              {filtered.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  vehicleNo={vehicleMap.get(expense.vehicle_id)?.vehicle_no}
                  onEdit={() => setEditingExpense(expense)}
                  onAudit={() => setAuditExpense(expense)}
                />
              ))}
            </div>

            {/* Full table — md and up, matching Navbar's own mobile/desktop breakpoint */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Vehicle</th>
                    <th className="px-3 py-2.5">Trip Ref</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((expense) => (
                    <tr key={expense.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDate(expense.date)}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-100">
                        {vehicleMap.get(expense.vehicle_id)?.vehicle_no ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">{expense.trip_reference ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="badge badge-neutral whitespace-nowrap">{expense.category}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{expense.description}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                        {formatInr(expense.amount)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setAuditExpense(expense)}
                            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            title="Audit trail"
                          >
                            <History size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingExpense(expense)}
                            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            title="Correct entry"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {editingExpense && (
        <EditFleetExpenseModal
          expense={editingExpense}
          vehicles={vehicles}
          onClose={() => setEditingExpense(null)}
          onUpdated={(updated) => {
            setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditingExpense(null);
          }}
        />
      )}

      {auditExpense && <FleetExpenseAuditTrailModal expense={auditExpense} onClose={() => setAuditExpense(null)} />}
    </div>
  );
}

function ExpenseCard({
  expense,
  vehicleNo,
  onEdit,
  onAudit,
}: {
  expense: FleetExpense;
  vehicleNo: string | undefined;
  onEdit: () => void;
  onAudit: () => void;
}) {
  return (
    <div className="glass-panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <Route size={15} />
          </span>
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{vehicleNo ?? "—"}</p>
            <p className="text-xs text-slate-400">{formatDate(expense.date)}</p>
          </div>
        </div>
        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{formatInr(expense.amount)}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="badge badge-neutral w-fit">{expense.category}</span>
        {expense.trip_reference && <span className="text-xs text-slate-400">Trip: {expense.trip_reference}</span>}
      </div>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{expense.description}</p>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button type="button" onClick={onAudit} className="btn-secondary px-2.5 py-1.5 text-xs">
          <History size={12} /> Audit
        </button>
        <button type="button" onClick={onEdit} className="btn-secondary px-2.5 py-1.5 text-xs">
          <Pencil size={12} /> Correct
        </button>
      </div>
    </div>
  );
}
