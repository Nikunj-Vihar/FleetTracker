import { describe, expect, it } from "vitest";
import { computePeriodDelta, deltaTone, splitByPeriod } from "@/lib/kpiTrend";

const TODAY = new Date("2026-09-30T12:00:00.000Z");

interface DatedItem {
  date: string;
}

function item(date: string): DatedItem {
  return { date };
}

describe("splitByPeriod", () => {
  it("bins items into the current window (inclusive of today) and the previous window", () => {
    const items = [
      item("2026-09-30"), // today -> current
      item("2026-09-15"), // 15 days ago -> current (within last 30 days)
      item("2026-09-01"), // 29 days ago -> current (boundary, current window is [Aug 31, Sep 30])
      item("2026-08-15"), // 46 days ago -> previous
      item("2026-08-01"), // 60 days ago -> previous (boundary, previous window is [Aug 1, Aug 31))
      item("2026-07-01"), // outside both windows
    ];
    const { current, previous } = splitByPeriod(items, (i) => i.date, 30, TODAY);
    expect(current.map((i) => i.date)).toEqual(["2026-09-30", "2026-09-15", "2026-09-01"]);
    expect(previous.map((i) => i.date)).toEqual(["2026-08-15", "2026-08-01"]);
  });

  it("returns empty arrays when there's no data in either window", () => {
    const { current, previous } = splitByPeriod([] as DatedItem[], (i) => i.date, 30, TODAY);
    expect(current).toEqual([]);
    expect(previous).toEqual([]);
  });
});

describe("computePeriodDelta", () => {
  it("computes a normal percentage increase", () => {
    const delta = computePeriodDelta(120, 100);
    expect(delta.deltaPct).toBeCloseTo(20, 5);
    expect(delta.direction).toBe("UP");
  });

  it("computes a normal percentage decrease", () => {
    const delta = computePeriodDelta(80, 100);
    expect(delta.deltaPct).toBeCloseTo(-20, 5);
    expect(delta.direction).toBe("DOWN");
  });

  it("treats a sub-0.5% change as FLAT rather than a spurious direction", () => {
    const delta = computePeriodDelta(100.2, 100);
    expect(delta.direction).toBe("FLAT");
  });

  it("distinguishes 'no prior data' (null) from 'prior was exactly zero'", () => {
    const noPriorData = computePeriodDelta(5, null);
    expect(noPriorData.previous).toBeNull();
    expect(noPriorData.deltaPct).toBeNull();
    expect(noPriorData.direction).toBe("FLAT");

    const priorWasZero = computePeriodDelta(5, 0);
    expect(priorWasZero.previous).toBe(0);
    expect(priorWasZero.deltaPct).toBeNull();
    expect(priorWasZero.direction).toBe("UP");
  });

  it("treats zero-to-zero as FLAT, not UP", () => {
    const delta = computePeriodDelta(0, 0);
    expect(delta.direction).toBe("FLAT");
    expect(delta.deltaPct).toBeNull();
  });
});

describe("deltaTone", () => {
  it("marks an UP trend as good when up is the good direction", () => {
    const delta = computePeriodDelta(120, 100); // UP
    expect(deltaTone(delta, "up")).toBe("good");
    expect(deltaTone(delta, "down")).toBe("worse");
  });

  it("marks a DOWN trend as good when down is the good direction", () => {
    const delta = computePeriodDelta(80, 100); // DOWN
    expect(deltaTone(delta, "down")).toBe("good");
    expect(deltaTone(delta, "up")).toBe("worse");
  });

  it("is always neutral when the metric has no inherently good direction", () => {
    const up = computePeriodDelta(120, 100);
    const down = computePeriodDelta(80, 100);
    expect(deltaTone(up, "neutral")).toBe("neutral");
    expect(deltaTone(down, "neutral")).toBe("neutral");
  });

  it("is neutral for a FLAT direction regardless of goodDirection", () => {
    const flat = computePeriodDelta(100.1, 100);
    expect(deltaTone(flat, "up")).toBe("neutral");
    expect(deltaTone(flat, "down")).toBe("neutral");
  });
});
