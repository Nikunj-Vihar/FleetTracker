"use client";

import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PeriodDelta } from "@/lib/kpiTrend";
import { deltaTone, type GoodDirection } from "@/lib/kpiTrend";

interface HeroKpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  delta: PeriodDelta | null;
  goodDirection: GoodDirection;
  href?: string;
}

// The Dashboard's single "hero" metric — one wide, large-type panel that
// answers the one question a fleet owner should be able to answer in
// under a glance, per fleet-SaaS dashboard research: a hero metric with a
// period-over-period trend, not a flat wall of equal-weight tiles.
export default function HeroKpiCard({ icon: Icon, label, value, sub, delta, goodDirection, href }: HeroKpiCardProps) {
  const tone = delta ? deltaTone(delta, goodDirection) : "neutral";
  const toneClass = tone === "good" ? "badge-good" : tone === "worse" ? "badge-worse" : "badge-neutral";
  const DeltaIcon = delta?.direction === "DOWN" ? TrendingDown : TrendingUp;

  const content = (
    <div className="glass-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <Icon size={26} />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-0.5 text-4xl font-semibold tabular-nums text-slate-900 sm:text-5xl dark:text-white">{value}</p>
          {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
      </div>

      {delta && delta.direction !== "FLAT" && (
        <span className={`badge ${toneClass} self-start text-sm sm:self-center`}>
          <DeltaIcon size={13} />
          {delta.deltaPct != null ? `${Math.abs(delta.deltaPct).toFixed(0)}%` : "New"} vs previous 30 days
        </span>
      )}
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block transition-opacity hover:opacity-90">
      {content}
    </Link>
  );
}
