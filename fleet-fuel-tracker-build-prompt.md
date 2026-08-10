
# Build Prompt for Claude Code: Fleet Fuel Log & Anomaly Tracker (Client Project)

Paste this into Claude Code as your project prompt. Real client, real money at stake (this tool exists specifically because they were losing money to unverified fuel reporting) — treat validation logic as the core feature, not a nice-to-have.

---

## 1. Background

The client runs a small fleet of trucks. Previously, drivers self-reported fuel amounts verbally with no verification, causing real financial loss. They've since started manually logging, per vehicle per trip, on a paper "Vehicle Running Status" sheet: Date, Place, Driver, Vehicle No, Return Reading (odometer), Onward Reading (odometer), Total KMS, Diesel Consumed, and Average (km/l) — computing the last two by hand.

This tool digitizes exactly that workflow first, with the express goal of catching the same kind of discrepancies they were fighting on paper — not adding new complexity. Garage/maintenance tracking is a deliberate future phase, out of scope for this build.

## 2. Core Data Captured (matches the paper log exactly)

Per entry:
- Date
- Place (optional free text — inconsistently filled on the paper log too, don't make it required)
- Driver (select from a driver list, with an "add new driver" option inline)
- Vehicle No (select from a vehicle list, same inline-add pattern)
- Return Reading (odometer, at end of trip)
- Onward Reading (odometer, at start of trip)
- Diesel Consumed (litres)

**Do not ask the user to manually enter Total KMS or Average.** On the paper log these are hand-calculated, which is exactly where arithmetic slips happen. Compute both automatically:
- `Total KMS = Return Reading − Onward Reading`
- `Average (km/l) = Total KMS / Diesel Consumed`

## 3. Setup Data (one-time, before daily logging starts)

**Vehicle master list:**
- Vehicle number
- Vehicle type/model (optional, useful context)
- Starting odometer reading (to seed the continuity check in §4)
- Expected average km/l for this vehicle — ask the client for their own working number if they have one; otherwise leave blank and let the system establish a baseline from the first 2-3 weeks of real entries (see §5)

**Driver list:**
- Driver name
- (Optional) phone number, for future reference

## 4. Validation — This Is the Point of the Tool

Three checks, all derived directly from patterns visible in the client's own paper logs:

1. **Odometer continuity check**: for a given vehicle, a new entry's Onward Reading should equal that vehicle's most recent previous Return Reading. This is already implicitly true in their paper log — every consecutive entry for the same vehicle number carries forward the prior return reading. Flag (don't hard-block, in case of a genuinely missed log) any entry that breaks this chain, since a gap here is exactly the kind of thing that let unverified numbers slip through before.
2. **Physical sanity check**: Return Reading must be ≥ Onward Reading (reject negative KMS outright — not a soft flag, a hard validation error, since it's not physically possible barring an odometer rollover, which should be a distinct manual flag, not silently accepted).
3. **Diesel-consumed sanity check**: reject an entry where Diesel Consumed exceeds a sane per-vehicle tank-capacity-based upper bound (configurable per vehicle in the setup data) — catches obvious typos (e.g. a stray extra digit) immediately at entry time rather than downstream.

**Support corrections without losing history.** The paper log shows at least one case of a combined/corrected entry (KMS and diesel figures added together after an amendment). Build entries as append-only with an edit history, not silent overwrites — every correction should show what the original value was, who changed it, and when. This is where the real accountability upgrade over paper comes from.

## 5. Anomaly / Fraud Detection — The Core Value Proposition

This is the actual reason the client wants this tool, so make it central, not buried in a settings page:

- Maintain a rolling per-vehicle average km/l baseline (start from the client-provided expected value if given at setup; once ~10-15 real entries exist for a vehicle, blend in or shift to the vehicle's own trailing average, since real-world conditions may differ from any assumed number).
- Flag any single entry where the computed average deviates more than **8%** from that vehicle's baseline — this is the threshold fleet operators generally use in practice before treating a deviation as worth investigating, rather than picking an arbitrary number. Make this threshold configurable, since it may need tuning once you see this client's actual variance.
- Distinguish direction of the flag in the UI: an average **worse than baseline** (fewer km per litre than expected) is the theft/over-reporting direction the client originally cared about; an average **better than baseline** is worth flagging too, but differently — possibly a genuine efficiency win, a data entry error, or under-reporting.
- Also track **per-driver** average km/l, not just per-vehicle — since a vehicle can have more than one driver over time (this fleet's data shows largely one driver per vehicle currently, but don't hardcode that assumption). If a specific driver's average is consistently worse than other drivers on the same vehicle, that's a distinct, actionable signal from a vehicle-level mechanical issue.

## 6. Dashboard

- **Fleet summary**: total KMs run, total diesel consumed, total estimated fuel cost (if a ₹/litre rate is entered in settings), fleet-wide average km/l, and a flagged-entries count for the period.
- **Per-vehicle view**: trend of average km/l over time against its baseline (shaded expected-range band, same visual approach as the solar dashboard's baseline comparison), with flagged entries clearly marked on the trend line, not just listed separately.
- **Per-driver view**: same trend concept, driver-centric, useful for the exact conversation this client presumably already has ("this driver's numbers don't add up") but now backed by data instead of word of mouth.
- **Flagged entries list**: plain-language, e.g. "Vehicle 2392, 4 May: average 5.51 km/l vs baseline 7.8 km/l (−29%) — flagged for review," sorted most-recent-and-most-severe first.

## 7. Architecture & Tech Stack

Same reasoning as the solar dashboard build — this is ongoing, real financial data for a real business, not a portfolio piece, so:

- **Frontend**: React (Next.js), mobile-first — drivers or the person logging on their behalf will likely enter this from a phone at the depot, matching how the paper log was actually filled out on-site.
- **Backend**: Supabase (Postgres) — relational data (vehicles → entries, drivers → entries) with built-in Auth and Row Level Security.
- **Charts**: Recharts or Chart.js for the trend views in §6.

## 8. Security & Data Integrity Requirements

- Authentication required — this is financial/operational data directly tied to the client's cost control, not something to leave publicly reachable.
- Row Level Security so this client's fleet data is isolated (relevant if this tool is ever offered to more than one client).
- Full audit trail on every entry and every correction: who entered/edited it, and when (see §4).
- Input validation per §4 enforced server-side, not just in the UI (a client-side-only check can be bypassed).
- No API keys or credentials exposed client-side.
- Regular backups plus a CSV export option, so the client always has an offline copy — this is the same category of record their paper logs were, and they shouldn't be more dependent on your hosting than they were on a filing cabinet.

## 9. UI/UX Standards

- Fast entry above all else, mirroring the solar dashboard's logging-speed principle — if this is slower or clunkier than filling out the paper form, it won't get adopted.
- Vehicle and driver selection via searchable dropdowns (fleet will grow), not free text, to keep the anomaly detection in §5 reliable — free-text vehicle numbers would fragment the data.
- Flagged entries visually distinct (icon + label, not color alone) directly in the entry list, so review happens as part of normal browsing, not a separate report someone has to remember to check.

## 10. Testing & Integrity Checks

1. **Continuity check test**: confirm a broken Onward/Return chain for a vehicle is correctly flagged, and a valid chain is not.
2. **Computed-field test**: confirm Total KMS and Average are always calculated, never manually enterable, and correctly recompute if an entry is later corrected.
3. **Anomaly threshold test**: using this client's actual logged data (or a synthetic set built from it) as a baseline, confirm the 8% deviation flag fires on the real outlier entries visible in the sample log (e.g. the 5.51 and 5.66 km/l entries against a vehicle otherwise averaging ~7.8-8.7) and doesn't over-flag normal day-to-day variation.
4. **Sanity check test**: confirm negative-KMS and above-tank-capacity diesel entries are hard-rejected, not just flagged.
5. **Audit trail test**: confirm every correction preserves the original value and records who/when, and that this history is actually viewable, not just stored silently.
6. **Auth/RLS test**: confirm no fleet data is reachable without authentication.

## 11. Definition of Done

- Entry form matches the paper log's fields exactly, with Total KMS and Average auto-computed.
- All three validation checks from §4 working, including the continuity check.
- Per-vehicle and per-driver baselines established and the 8% anomaly flag working, verified against §10.3.
- Dashboard views from §6 live with real data.
- Audit trail functioning for corrections.
- CSV export available.
