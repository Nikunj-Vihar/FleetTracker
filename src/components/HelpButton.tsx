"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";

interface HelpSection {
  heading: string;
  points: string[];
}

interface HelpContent {
  title: string;
  intro: string;
  sections: HelpSection[];
}

// Keyed by pathname — one entry per nav page, kept in plain language since
// this is the in-app explanation for whoever is actually logging trips and
// bills day to day, not a developer reference.
const HELP_CONTENT: Record<string, HelpContent> = {
  "/": {
    title: "Dashboard",
    intro: "A quick health check of the whole fleet.",
    sections: [
      {
        heading: "KPI cards",
        points: [
          "Total KMs, diesel used, fuel cost and fleet average km/l, all for the selected period.",
          "Flagged count is how many trips came back outside the expected range and still need a look.",
        ],
      },
      {
        heading: "Trend chart",
        points: [
          "The shaded band is each vehicle's expected km/l range — points inside it are normal.",
          "Red points ran worse than expected (possible leak, theft, tyre pressure, traffic). Blue points ran better than expected (worth double-checking the entry itself).",
        ],
      },
      {
        heading: "Flagged alerts",
        points: ["Lists the specific trips that triggered a flag, most severe first, with the reason in plain language."],
      },
    ],
  },
  "/log": {
    title: "Log Trip",
    intro: "The fast daily entry form — fill this in once per trip.",
    sections: [
      {
        heading: "What to enter",
        points: [
          "Date, driver, vehicle, place (optional), onward reading, return reading, and diesel consumed.",
          "Total KMs and Average km/l are always calculated for you — they're never typed in directly.",
        ],
      },
      {
        heading: "Validation messages",
        points: [
          "A red error blocks saving outright — e.g. return reading lower than onward reading, or diesel consumed more than the tank holds.",
          "A yellow warning still lets you save, but flags something worth checking — e.g. an odometer gap from the last trip, or an average that's unusually far from that vehicle's baseline.",
        ],
      },
      {
        heading: "New driver or vehicle",
        points: ["Use \"Add new\" right inside the dropdown — no need to leave this page first."],
      },
    ],
  },
  "/entries": {
    title: "Log History",
    intro: "Every trip ever logged, searchable and filterable.",
    sections: [
      {
        heading: "Finding entries",
        points: ["Search by vehicle, driver, place or date, or use the vehicle filter to narrow the list."],
      },
      {
        heading: "Fixing a mistake",
        points: [
          "Entries are never silently overwritten. Use \"Correct entry\" and give a short reason — the original value is preserved.",
          "The audit icon shows the full history of changes for that entry, including who changed what and why.",
        ],
      },
    ],
  },
  "/expenses": {
    title: "Garage & Maintenance Expenses",
    intro: "One record per bill — tyre changes, servicing, repairs.",
    sections: [
      {
        heading: "Logging a bill",
        points: [
          "Pick the vehicle and garage, describe the work, and enter the total cost. Odometer reading and bill number are optional but help with matching against paper bills later.",
          "If a single visit covers two garages, log it as two separate entries.",
        ],
      },
      {
        heading: "Paid / Unpaid",
        points: [
          "Click the status badge on any row to toggle it between Paid and Unpaid — no need to open the edit form.",
          "The Outstanding total shows what's still owed across the currently filtered vehicles/search, regardless of the Paid/Unpaid filter.",
        ],
      },
      {
        heading: "Fixing a mistake",
        points: ["Same as trip entries — use \"Correct entry\" with a reason. Everything is kept in the audit trail, nothing is silently overwritten."],
      },
    ],
  },
  "/vehicles": {
    title: "Vehicles",
    intro: "The master list of trucks in the fleet.",
    sections: [
      {
        heading: "Adding a vehicle",
        points: [
          "Vehicle No. is how it's found everywhere else in the app — keep it consistent with what's written on the paper logs.",
          "Tank Capacity is used to reject impossible diesel entries (more than the tank can physically hold).",
          "Expected Avg (km/l) is the starting baseline before enough trips exist to calculate one automatically. Leave it blank to let the app learn it from the first 10-15 entries.",
        ],
      },
    ],
  },
  "/drivers": {
    title: "Drivers",
    intro: "Efficiency per driver, independent of which vehicle they drove.",
    sections: [
      {
        heading: "Why this exists",
        points: [
          "A vehicle isn't always driven by the same person — this page tracks each driver's own average km/l across every vehicle they've driven.",
          "\"vs Fleet Avg\" highlights drivers running noticeably worse than the rest of the fleet, which can point to driving style rather than a vehicle problem.",
        ],
      },
    ],
  },
  "/settings": {
    title: "Settings",
    intro: "Fleet-wide configuration.",
    sections: [
      {
        heading: "Fuel Rate & Anomaly Threshold",
        points: [
          "Fuel Rate (₹/L) is used to turn diesel consumed into a cost figure on the dashboard.",
          "Anomaly Threshold (%) is how far a trip's average can drift from baseline before it gets flagged — lower catches more, higher catches only bigger deviations.",
        ],
      },
      {
        heading: "Your Name",
        points: ["Used to attribute corrections in the audit trail so it's clear who changed what."],
      },
      {
        heading: "Danger Zone",
        points: ["Deleting your account permanently removes your organization and everything in it. It's gated behind an emailed confirmation code so it can't happen by accident."],
      },
    ],
  },
};

const DEFAULT_CONTENT: HelpContent = {
  title: "Help",
  intro: "How this page works.",
  sections: [],
};

export default function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const content = HELP_CONTENT[pathname] ?? DEFAULT_CONTENT;

  // The trigger button lives inside the navbar's backdrop-blur header,
  // which establishes a containing block for position:fixed descendants —
  // without a portal, the modal below would position itself relative to
  // that 64px header bar instead of the actual viewport.
  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
        aria-label="Help for this page"
        title="Help for this page"
      >
        <HelpCircle size={19} />
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="glass-panel-solid max-h-[80vh] w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-brand-600" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{content.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                aria-label="Close help"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-4">
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{content.intro}</p>
              {content.sections.length === 0 ? (
                <p className="text-sm text-slate-400">No help content for this page yet.</p>
              ) : (
                <div className="space-y-4">
                  {content.sections.map((section) => (
                    <div key={section.heading}>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {section.heading}
                      </h3>
                      <ul className="space-y-1.5">
                        {section.points.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
