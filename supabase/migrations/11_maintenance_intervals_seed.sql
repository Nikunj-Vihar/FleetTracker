-- Seeds a default maintenance_intervals settings row for every new signup,
-- mirroring src/lib/maintenance.ts's DEFAULT_MAINTENANCE_INTERVALS. Existing
-- orgs don't need a backfill: src/lib/store.ts#getSettings() already merges
-- these defaults in whenever the key is missing, so nothing breaks for orgs
-- created before this migration — this just keeps brand-new orgs consistent
-- with what the app would show them anyway.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  new_org_id UUID;
BEGIN
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', 'My Fleet'))
  RETURNING id INTO new_org_id;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  INSERT INTO public.settings (org_id, key, value) VALUES
    (new_org_id, 'fuel_rate_inr', '95.50'),
    (new_org_id, 'anomaly_threshold_pct', '8.0'),
    (new_org_id, 'maintenance_intervals', '{
      "Tyres": { "km": 40000, "months": null },
      "Battery": { "km": null, "months": 24 },
      "Engine / Servicing": { "km": 10000, "months": 6 },
      "Brakes": { "km": 30000, "months": null },
      "Suspension": { "km": 50000, "months": null }
    }'::jsonb);

  RETURN NEW;
END;
$$;
