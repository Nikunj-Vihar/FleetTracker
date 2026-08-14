// Maintenance categorization + predictive "due soon" alerts. The client's
// garage ledger isn't one undifferentiated thing — a tyre job, a battery
// swap, and an electrical fix have nothing in common except that they all
// happened at a garage. Splitting expenses into a fixed category list lets
// us track a service interval per category and warn before the next trip,
// rather than only ever looking back at what's already been spent.

import type { FuelEntry, GarageExpense, MaintenanceIntervals, Vehicle } from "./types";

export const EXPENSE_CATEGORIES = [
  "Tyres",
  "Battery",
  "Electrical",
  "Engine / Servicing",
  "Brakes",
  "Suspension",
  "Body / Paint",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// Categories with a sensible generic service interval. Electrical, Body /
// Paint and Other are reactive-only — there's no honest generic interval
// for "when does a light bulb fail," so they never produce a due-soon
// alert, only the category label on the bill itself.
export const ALERTABLE_CATEGORIES: ExpenseCategory[] = [
  "Tyres",
  "Battery",
  "Engine / Servicing",
  "Brakes",
  "Suspension",
];

// Generic starting points, editable per org in Settings — not tuned to any
// specific truck model, just typical intervals so alerts are useful from
// day one instead of requiring setup first.
export const DEFAULT_MAINTENANCE_INTERVALS: MaintenanceIntervals = {
  Tyres: { km: 40000, months: null },
  Battery: { km: null, months: 24 },
  "Engine / Servicing": { km: 10000, months: 6 },
  Brakes: { km: 30000, months: null },
  Suspension: { km: 50000, months: null },
};

// Reached 90% of the interval — worth a heads-up before it's actually overdue.
const DUE_SOON_RATIO = 0.9;

export type MaintenanceAlertStatus = "OVERDUE" | "DUE_SOON";

export interface MaintenanceAlert {
  vehicleId: string;
  category: string;
  status: MaintenanceAlertStatus;
  lastServiceDate: string;
  lastServiceOdometer: number | null;
  currentOdometer: number | null;
  kmSinceService: number | null;
  kmThreshold: number | null;
  monthsSinceService: number | null;
  monthsThreshold: number | null;
}

function monthsBetween(from: string, to: Date): number {
  const start = new Date(`${from}T00:00:00.000Z`);
  const days = (to.getTime() - start.getTime()) / 86_400_000;
  return days / 30.4368;
}

// Most recent fuel entry's return reading per vehicle — the best available
// proxy for "current odometer" without a live telematics feed.
function latestOdometerByVehicle(entries: FuelEntry[]): Map<string, number> {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
  );
  const map = new Map<string, number>();
  for (const e of sorted) {
    map.set(e.vehicle_id, e.return_reading);
  }
  return map;
}

// Most recent garage expense per (vehicle, category) — only categories a
// vehicle has at least one prior expense for can ever produce an alert;
// there's no honest way to guess a due date with zero service history.
function latestExpenseByVehicleCategory(expenses: GarageExpense[]): Map<string, GarageExpense> {
  const sorted = [...expenses].sort(
    (a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)
  );
  const map = new Map<string, GarageExpense>();
  for (const e of sorted) {
    map.set(`${e.vehicle_id}::${e.category}`, e);
  }
  return map;
}

export function computeMaintenanceAlerts(
  vehicles: Vehicle[],
  expenses: GarageExpense[],
  entries: FuelEntry[],
  intervals: MaintenanceIntervals,
  today: Date = new Date()
): MaintenanceAlert[] {
  const currentOdometers = latestOdometerByVehicle(entries);
  const latestByKey = latestExpenseByVehicleCategory(expenses);
  const alerts: MaintenanceAlert[] = [];

  for (const vehicle of vehicles) {
    const currentOdometer = currentOdometers.get(vehicle.id) ?? null;

    for (const category of ALERTABLE_CATEGORIES) {
      const lastExpense = latestByKey.get(`${vehicle.id}::${category}`);
      if (!lastExpense) continue;

      const interval = intervals[category] ?? DEFAULT_MAINTENANCE_INTERVALS[category];
      if (!interval) continue;

      const kmSinceService =
        currentOdometer != null && lastExpense.odometer_reading != null
          ? currentOdometer - lastExpense.odometer_reading
          : null;
      const monthsSinceService = monthsBetween(lastExpense.date, today);

      const kmRatio = interval.km != null && kmSinceService != null ? kmSinceService / interval.km : null;
      const monthsRatio = interval.months != null ? monthsSinceService / interval.months : null;

      const ratios = [kmRatio, monthsRatio].filter((r): r is number => r != null);
      if (ratios.length === 0) continue;
      const maxRatio = Math.max(...ratios);
      if (maxRatio < DUE_SOON_RATIO) continue;

      alerts.push({
        vehicleId: vehicle.id,
        category,
        status: maxRatio >= 1 ? "OVERDUE" : "DUE_SOON",
        lastServiceDate: lastExpense.date,
        lastServiceOdometer: lastExpense.odometer_reading,
        currentOdometer,
        kmSinceService,
        kmThreshold: interval.km,
        monthsSinceService: Math.round(monthsSinceService),
        monthsThreshold: interval.months,
      });
    }
  }

  return alerts.sort((a, b) => {
    if (a.status !== b.status) return a.status === "OVERDUE" ? -1 : 1;
    return 0;
  });
}
