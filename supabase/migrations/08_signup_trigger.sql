-- Auto-provisions a fresh organization for every new Supabase Auth
-- sign-up, so "create an account" and "get your own isolated fleet"
-- are the same action from the user's point of view — no separate
-- admin step. org_name comes from the sign-up form via
-- supabase.auth.signUp()'s options.data (see src/lib/auth.ts).
--
-- SECURITY DEFINER + explicit search_path: this runs against
-- auth.users, a table the app's normal role can't write triggers'
-- side effects into directly, and pinning search_path avoids the
-- classic SECURITY DEFINER schema-injection footgun.
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
    (new_org_id, 'anomaly_threshold_pct', '8.0');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
