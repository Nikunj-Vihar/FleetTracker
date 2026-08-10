# CLAUDE.md - Fleet Fuel Log & Anomaly Tracker

## Project Overview

**Fleet Fuel Log & Anomaly Tracker** is a production-grade web application built to digitize daily vehicle trip and fuel logging for fleet operations. Its primary purpose is to eliminate financial losses caused by unverified verbal reporting, math errors on paper logs, odometer gaps, and fuel theft.

---

## Technical Stack

- **Framework**: Next.js 14+ (App Router), TypeScript, React 18+
- **Styling**: Tailwind CSS, Lucide Icons, Glassmorphism design system
- **Visualization**: Recharts (for baseline trend charts with expected bands)
- **Database & Auth**: Supabase (PostgreSQL with RLS), fallback to LocalStorage mock engine for standalone local execution
- **Testing**: Vitest / Jest for unit tests on validation and anomaly detection logic

---

## Core Commands

- **Development**: `npm run dev`
- **Build**: `npm run build`
- **Start**: `npm run start`
- **Lint**: `npm run lint`
- **Test**: `npm test` or `npx vitest run`

---

## Core Business & Validation Logic Specs

### 1. Data Entry & Auto-Calculated Fields
Each trip log contains:
- `Date` (ISO Date string)
- `Place` (Optional free-text)
- `Driver` (Searchable select dropdown with inline "Add New Driver" modal)
- `Vehicle No` (Searchable select dropdown with inline "Add New Vehicle" modal)
- `Onward Reading` (Odometer start)
- `Return Reading` (Odometer end)
- `Diesel Consumed` (Litres)

**Auto-Computed Formulas** (never manually editable):
```ts
Total KMS = Return Reading - Onward Reading
Average (km/l) = Total KMS / Diesel Consumed
```

---

### 2. Validation Engine Rules

| Validation Type | Rule / Logic | Action | Message |
| :--- | :--- | :--- | :--- |
| **Physical Sanity (KMS)** | `Return Reading < Onward Reading` | **HARD REJECT** | "Return reading cannot be less than onward reading (negative KMS)." |
| **Physical Sanity (Tank)** | `Diesel Consumed > Tank Capacity` | **HARD REJECT** | "Diesel consumed exceeds vehicle tank capacity (XX Litres)." |
| **Odometer Continuity** | `New Onward Reading != Most Recent Previous Return Reading` | **SOFT FLAG** | "Odometer gap detected! Expected XX km based on previous trip return reading." |
| **Anomaly Detection** | `\|Computed Avg - Baseline Avg\| / Baseline Avg > Threshold %` (default 8%) | **FLAGGED ALERT** | "Average XX km/l deviates by YY% from vehicle baseline ZZ km/l." |

---

### 3. Anomaly & Fraud Detection Engine

1. **Baseline Maintenance**:
   - Initial expected average set during Vehicle Setup.
   - Blends into vehicle trailing baseline after ~10-15 entries.
2. **Direction Distinction**:
   - **Worse than Baseline** (e.g. 5.5 km/l vs 7.8 km/l baseline): High severity red flag (potential theft/leak/under-inflated tires).
   - **Better than Baseline** (e.g. 10.2 km/l vs 7.8 km/l baseline): Blue review flag (potential under-reporting or data entry typo).
3. **Per-Driver Tracking**:
   - Tracks average km/l per driver across vehicles to isolate driver behavior from vehicle mechanical issues.

---

### 4. Audit Trail & Corrections Requirement
- Entries are append-only; corrections create an audit log record instead of silent overwrites.
- Audit Record Schema:
  - `entry_id`
  - `field_changed`
  - `old_value`
  - `new_value`
  - `changed_by`
  - `changed_at`
  - `reason`

---

## Supabase Schema & SQL Setup

Save the SQL script below in `supabase/migrations/01_initial_schema.sql`:

```sql
-- Create Vehicles Table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no VARCHAR(50) UNIQUE NOT NULL,
  model VARCHAR(100),
  starting_odometer NUMERIC NOT NULL DEFAULT 0,
  expected_avg NUMERIC(5,2), -- Baseline km/l
  tank_capacity NUMERIC(6,2) NOT NULL DEFAULT 300.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Fuel Log Entries Table
CREATE TABLE IF NOT EXISTS public.fuel_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  place VARCHAR(200),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  onward_reading NUMERIC NOT NULL,
  return_reading NUMERIC NOT NULL,
  total_kms NUMERIC GENERATED ALWAYS AS (return_reading - onward_reading) STORED,
  diesel_consumed NUMERIC NOT NULL,
  average_kml NUMERIC GENERATED ALWAYS AS (
    CASE WHEN diesel_consumed > 0 THEN (return_reading - onward_reading) / diesel_consumed ELSE 0 END
  ) STORED,
  is_continuity_broken BOOLEAN DEFAULT FALSE,
  is_anomalous BOOLEAN DEFAULT FALSE,
  anomaly_direction VARCHAR(20), -- 'WORSE' or 'BETTER'
  anomaly_deviation_pct NUMERIC(5,2),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.entry_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES public.fuel_entries(id) ON DELETE CASCADE,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Application Settings Table
CREATE TABLE IF NOT EXISTS public.settings (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Settings
INSERT INTO public.settings (key, value) VALUES
  ('fuel_rate_inr', '95.50'),
  ('anomaly_threshold_pct', '8.0')
ON CONFLICT (key) DO NOTHING;
```

---

## File Architecture Blueprint

```
/Users/vanimisettinikunj/AntiGravity Projects/FleetTracker/
├── CLAUDE.md                           # This workspace specification file
├── supabase/
│   └── migrations/
│       └── 01_initial_schema.sql       # Database schema & migrations
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Global App Layout with Navigation Header & Theme Provider
│   │   ├── page.tsx                    # Main Fleet Dashboard (Summary KPI cards, Trend Chart, Flagged Alerts)
│   │   ├── log/
│   │   │   └── page.tsx                # Fast Daily Trip & Fuel Entry Form
│   │   ├── entries/
│   │   │   └── page.tsx                # Full Log History table with Filter, Search & Audit Modal
│   │   ├── vehicles/
│   │   │   └── page.tsx                # Vehicle Master list & baseline configuration
│   │   ├── drivers/
│   │   │   └── page.tsx                # Driver Master list & efficiency ratings
│   │   ├── settings/
│   │   │   └── page.tsx                # Fuel Rate ₹/L, Anomaly Threshold %, Seed Sample Data
│   │   └── api/                        # API handlers
│   ├── components/
│   │   ├── Navbar.tsx                  # Navigation bar with responsive mobile menu
│   │   ├── DailyLogForm.tsx            # Form with auto-computed KMS & km/l and real-time validation
│   │   ├── FleetSummaryCards.tsx       # KPI stat cards (KMs, Diesel, Fuel Cost, Fleet Avg, Flagged Count)
│   │   ├── BaselineTrendChart.tsx      # Recharts graph with shaded expected-range band & flagged points
│   │   ├── FlaggedAlertsList.tsx       # Severity-sorted anomaly cards with plain language context
│   │   ├── AuditTrailModal.tsx         # Modal displaying edit history & original values
│   │   ├── InlineAddModal.tsx          # Quick inline driver/vehicle creation modal
│   │   └── CsvExportButton.tsx         # Offline CSV download button
│   ├── lib/
│   │   ├── types.ts                    # TypeScript types
│   │   ├── validation.ts               # Core validation & anomaly calculation engine
│   │   ├── store.ts                    # State management (Supabase + LocalStorage fallback engine)
│   │   ├── mockData.ts                 # Initial real-world sample entries matching paper log data
│   │   └── supabase.ts                 # Supabase client initialization
│   └── __tests__/
│       └── validation.test.ts          # Comprehensive unit test suite
```

---

## Code Guidelines & Conventions

1. **Strict Client & Server Validation**:
   - Always run validation in `src/lib/validation.ts` before creating or editing an entry.
2. **Never allow manual input for derived fields**:
   - `Total KMS` and `Average (km/l)` must always be computed automatically.
3. **No destructive overwrites**:
   - Edits must call `recordAuditLog()` to save the prior field state.
4. **Offline Resilience**:
   - Ensure the app functions with LocalStorage when Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`) are not provided.
