"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, History, Loader2, Pencil, Receipt, Search, Wrench } from "lucide-react";
import GarageExpenseForm from "@/components/GarageExpenseForm";
import EditGarageExpenseModal from "@/components/EditGarageExpenseModal";
import GarageExpenseAuditTrailModal from "@/components/GarageExpenseAuditTrailModal";
import { useCurrentUser } from "@/lib/auth";
import { listGarageExpenses, listGarages, listVehicles, seedLocalSampleData, setGarageExpensePaidStatus } from "@/lib/store";
import { EXPENSE_CATEGORIES } from "@/lib/maintenance";
import { formatDate, formatInr } from "@/lib/utils";
import type { Garage, GarageExpense, Vehicle } from "@/lib/types";

export default function ExpensesPage() {
  const { user } = useCurrentUser();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [garages, setGarages] = useState<Garage[]>([]);
  const [expenses, setExpenses] = useState<GarageExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [search, setSearch] = useState("");
  const [editingExpense, setEditingExpense] = useState<GarageExpense | null>(null);
  const [auditExpense, setAuditExpense] = useState<GarageExpense | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleTogglePaid(expense: GarageExpense) {
    setTogglingId(expense.id);
    try {
      const updated = await setGarageExpensePaidStatus(expense.id, !expense.is_paid, user?.label ?? "Unknown");
      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch {
      // Toggle is best-effort from the list view; the user can retry, or use
      // "Correct entry" for the same field if this keeps failing.
    } finally {
      setTogglingId(null);
    }
  }

  useEffect(() => {
    (async () => {
      await seedLocalSampleData();
      const [v, g, e] = await Promise.all([listVehicles(), listGarages(), listGarageExpenses()]);
      setVehicles(v);
      setGarages(g);
      setExpenses(e);
      setLoading(false);
    })();
  }, []);

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const garageMap = useMemo(() => new Map(garages.map((g) => [g.id, g])), [garages]);

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses
      .filter((e) => vehicleFilter === "all" || e.vehicle_id === vehicleFilter)
      .filter((e) => categoryFilter === "all" || e.category === categoryFilter)
      .filter((e) => {
        if (!q) return true;
        const garageName = garageMap.get(e.garage_id ?? "")?.name ?? "";
        return (
          e.work_description.toLowerCase().includes(q) ||
          (e.bill_no ?? "").toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          garageName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, vehicleFilter, categoryFilter, search, garageMap]);

  const filtered = useMemo(
    () =>
      searchFiltered.filter(
        (e) => paidFilter === "all" || (paidFilter === "paid" ? e.is_paid : !e.is_paid)
      ),
    [searchFiltered, paidFilter]
  );

  const totalAmount = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);
  // Outstanding stays scoped to vehicle/search only (not the paid/unpaid
  // toggle itself) so it reads as a stable "what we still owe" figure no
  // matter which view the user is currently looking at.
  const outstandingAmount = useMemo(
    () => searchFiltered.filter((e) => !e.is_paid).reduce((sum, e) => sum + e.amount, 0),
    [searchFiltered]
  );

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
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Garage &amp; Maintenance Expenses</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One record per bill — tyre replacements, servicing, repairs, anchored to the vehicle and odometer reading.
        </p>
      </div>

      <GarageExpenseForm
        vehicles={vehicles}
        garages={garages}
        onVehicleCreated={(v) => setVehicles((prev) => [...prev, v])}
        onGarageCreated={(g) => setGarages((prev) => [...prev, g])}
        onExpenseCreated={(expense) => setExpenses((prev) => [...prev, expense])}
      />

      <div className="glass-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input-field w-56 pl-8"
                placeholder="Search work, garage, bill no..."
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
            <select className="input-field w-40" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="input-field w-32"
              value={paidFilter}
              onChange={(e) => setPaidFilter(e.target.value as "all" | "paid" | "unpaid")}
            >
              <option value="all">All status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Receipt size={14} className="text-brand-600" /> Total: {formatInr(totalAmount)} ({filtered.length} records)
            </p>
            {outstandingAmount > 0 && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                <CircleDollarSign size={14} /> Outstanding: {formatInr(outstandingAmount)}
              </p>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-slate-400">No expenses logged yet.</div>
        ) : (
          <>
            {/* Card list — below md (also covers the 640-767px tablet range, where a full data table wouldn't fit) */}
            <div className="space-y-2 md:hidden">
              {filtered.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  vehicleNo={vehicleMap.get(expense.vehicle_id)?.vehicle_no}
                  garageName={garageMap.get(expense.garage_id ?? "")?.name}
                  onEdit={() => setEditingExpense(expense)}
                  onAudit={() => setAuditExpense(expense)}
                  onTogglePaid={() => handleTogglePaid(expense)}
                  toggling={togglingId === expense.id}
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
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5 text-right">Odometer</th>
                    <th className="px-3 py-2.5">Work / Replacement</th>
                    <th className="px-3 py-2.5">Garage</th>
                    <th className="px-3 py-2.5">Bill No.</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5">Status</th>
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
                      <td className="px-3 py-2.5">
                        <span className="badge badge-neutral whitespace-nowrap">{expense.category}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {expense.odometer_reading != null ? expense.odometer_reading.toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{expense.work_description}</td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                        {garageMap.get(expense.garage_id ?? "")?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{expense.bill_no ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                        {formatInr(expense.amount)}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleTogglePaid(expense)}
                          disabled={togglingId === expense.id}
                          className={
                            expense.is_paid
                              ? "badge border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400"
                              : "badge border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
                          }
                          title={expense.is_paid ? "Click to mark unpaid" : "Click to mark paid"}
                        >
                          {togglingId === expense.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : expense.is_paid ? (
                            <CheckCircle2 size={11} />
                          ) : null}
                          {expense.is_paid ? "Paid" : "Unpaid"}
                        </button>
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
        <EditGarageExpenseModal
          expense={editingExpense}
          vehicles={vehicles}
          garages={garages}
          onClose={() => setEditingExpense(null)}
          onUpdated={(updated) => {
            setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            setEditingExpense(null);
          }}
        />
      )}

      {auditExpense && <GarageExpenseAuditTrailModal expense={auditExpense} onClose={() => setAuditExpense(null)} />}
    </div>
  );
}

function ExpenseCard({
  expense,
  vehicleNo,
  garageName,
  onEdit,
  onAudit,
  onTogglePaid,
  toggling,
}: {
  expense: GarageExpense;
  vehicleNo: string | undefined;
  garageName: string | undefined;
  onEdit: () => void;
  onAudit: () => void;
  onTogglePaid: () => void;
  toggling: boolean;
}) {
  return (
    <div className="glass-panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <Wrench size={15} />
          </span>
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{vehicleNo ?? "—"}</p>
            <p className="text-xs text-slate-400">{formatDate(expense.date)}</p>
          </div>
        </div>
        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{formatInr(expense.amount)}</p>
      </div>

      <span className="badge badge-neutral mt-2 w-fit">{expense.category}</span>
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{expense.work_description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        {garageName && <span>Garage: {garageName}</span>}
        {expense.bill_no && <span>Bill: {expense.bill_no}</span>}
        {expense.odometer_reading != null && <span>{expense.odometer_reading.toLocaleString("en-IN")} km</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onTogglePaid}
          disabled={toggling}
          className={
            expense.is_paid
              ? "badge border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400"
              : "badge border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
          }
        >
          {toggling ? (
            <Loader2 size={11} className="animate-spin" />
          ) : expense.is_paid ? (
            <CheckCircle2 size={11} />
          ) : null}
          {expense.is_paid ? "Paid" : "Unpaid"}
        </button>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onAudit} className="btn-secondary px-2.5 py-1.5 text-xs">
            <History size={12} /> Audit
          </button>
          <button type="button" onClick={onEdit} className="btn-secondary px-2.5 py-1.5 text-xs">
            <Pencil size={12} /> Correct
          </button>
        </div>
      </div>
    </div>
  );
}
