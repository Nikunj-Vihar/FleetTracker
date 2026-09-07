// Period-over-period comparison helpers for the Dashboard's KPI trend
// indicators. Pure functions only — no React, no fetching — callers pass
// in arrays they've already fetched (FuelEntry[], GarageExpense[],
// FleetExpense[], ...) and a date accessor, so this works across entity
// types without duplicating aggregation logic per caller.

export type TrendDirection = "UP" | "DOWN" | "FLAT";

export interface PeriodSplit<T> {
  current: T[];
  previous: T[];
}

// Bins items into "the last periodDays days" vs the periodDays immediately
// before that, by ISO date-string comparison (same idiom as the date
// handling in src/lib/maintenance.ts). Both windows are inclusive of their
// start date and the current window includes today.
export function splitByPeriod<T>(
  items: T[],
  getDateIso: (item: T) => string,
  periodDays: number,
  today: Date = new Date()
): PeriodSplit<T> {
  const todayIso = today.toISOString().slice(0, 10);

  const currentStart = new Date(today);
  currentStart.setDate(currentStart.getDate() - periodDays);
  const currentStartIso = currentStart.toISOString().slice(0, 10);

  const previousStart = new Date(today);
  previousStart.setDate(previousStart.getDate() - periodDays * 2);
  const previousStartIso = previousStart.toISOString().slice(0, 10);

  const current: T[] = [];
  const previous: T[] = [];
  for (const item of items) {
    const iso = getDateIso(item);
    if (iso >= currentStartIso && iso <= todayIso) {
      current.push(item);
    } else if (iso >= previousStartIso && iso < currentStartIso) {
      previous.push(item);
    }
  }
  return { current, previous };
}

export interface PeriodDelta {
  current: number;
  previous: number | null;
  deltaPct: number | null;
  direction: TrendDirection;
}

// previous === null means "no data at all in the prior window" (e.g. a
// vehicle added this month) — distinct from previous === 0 (the metric was
// genuinely zero last period), where a % change is undefined rather than
// automatically 0% or +Infinity%. Changes under 0.5% round to FLAT so
// rounding-level noise doesn't flip an arrow for no real reason.
export function computePeriodDelta(current: number, previous: number | null): PeriodDelta {
  if (previous == null) {
    return { current, previous: null, deltaPct: null, direction: "FLAT" };
  }
  if (previous === 0) {
    return { current, previous, deltaPct: null, direction: current === 0 ? "FLAT" : "UP" };
  }
  const deltaPct = ((current - previous) / previous) * 100;
  const direction: TrendDirection = deltaPct > 0.5 ? "UP" : deltaPct < -0.5 ? "DOWN" : "FLAT";
  return { current, previous, deltaPct, direction };
}

export type GoodDirection = "up" | "down" | "neutral";
export type DeltaTone = "good" | "worse" | "neutral";

// Maps a delta + "which direction is good for this metric" to one of the
// app's existing badge tones — never a reflexive green-up/red-down, since
// for some metrics (cost, distance run) more isn't inherently bad; it may
// just mean more trips happened.
export function deltaTone(delta: PeriodDelta, goodDirection: GoodDirection): DeltaTone {
  if (goodDirection === "neutral" || delta.direction === "FLAT") return "neutral";
  const isGood = goodDirection === "up" ? delta.direction === "UP" : delta.direction === "DOWN";
  return isGood ? "good" : "worse";
}
