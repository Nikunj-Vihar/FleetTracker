-- Multi-tenancy: each fleet business is an organization. Every table
-- added from here on anchors to org_id, not the plate string or any
-- other business key — same pattern the schema already uses for
-- vehicle_id (see 01_initial_schema.sql). Anticipated directly in
-- 02_row_level_security.sql's header comment.

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Links a Supabase Auth user to the organization they belong to. One
-- row per user for now — sign-up always creates a fresh org for the
-- signing-up user (see 08_signup_trigger.sql). No invite-a-teammate
-- flow yet, so current_org_id() below assumes at most one membership
-- per user.
CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members (user_id);

-- Resolves the calling user's organization from their JWT (auth.uid()).
-- Used as the org_id column DEFAULT on every tenant table's inserts and
-- as the RLS predicate on every tenant table's policies (see
-- 06_multi_tenant_columns.sql / 07_multi_tenant_rls.sql). Not SECURITY
-- DEFINER — it relies on org_members' own RLS policy (a user may read
-- their own membership row), so it only ever sees what the calling
-- user could already see directly.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid() LIMIT 1;
$$;
