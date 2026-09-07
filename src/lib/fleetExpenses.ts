// Categories for Fleet (trip/operational) Expenses — tolls, checkposts,
// loading/unloading labor, driver allowance, and other per-trip costs a
// truck racks up on the road, distinct from GarageExpense's vehicle-service
// billing categories in maintenance.ts.

export const FLEET_EXPENSE_CATEGORIES = [
  "Toll / State Gate",
  "RTO / Checkpost",
  "Loading / Unloading",
  "Driver Allowance (Bata/TA)",
  "Parking",
  "Tyre Puncture Repair",
  "Greasing",
  "Miscellaneous",
  "Other",
] as const;

export type FleetExpenseCategory = (typeof FLEET_EXPENSE_CATEGORIES)[number];

export const DEFAULT_FLEET_EXPENSE_CATEGORY: FleetExpenseCategory = "Other";
