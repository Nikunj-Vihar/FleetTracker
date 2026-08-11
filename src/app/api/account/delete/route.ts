// First server-side privileged route in the app. Deleting a Supabase
// Auth user requires the Admin API, which only works with the service
// role key — a secret that bypasses RLS entirely and must never reach
// the browser (hence no NEXT_PUBLIC_ prefix on SUPABASE_SERVICE_ROLE_KEY,
// and this route living server-side rather than in a client component).
//
// Security model: the client only reaches this call after completing
// src/lib/auth.ts's OTP reauthentication flow, which mints a brand-new
// access token by proving control of the account's email inbox right
// now. admin.auth.getUser(accessToken) below re-validates that token is
// currently live before anything is deleted — a stale or forged token
// is rejected outright.

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Account deletion is not configured on this server." }, { status: 500 });
  }

  let accessToken: string | undefined;
  try {
    const body = await req.json();
    accessToken = body?.accessToken;
  } catch {
    // falls through to the missing-token response below
  }
  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token." }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid or expired session — please confirm again." }, { status: 401 });
  }
  const userId = userData.user.id;

  const { data: membership, error: membershipError } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  // Deleting the organization cascades to every tenant table (vehicles,
  // drivers, fuel_entries, garages, garage_expenses, their audit logs,
  // settings, and org_members itself) — see
  // supabase/migrations/09_org_cascade_delete.sql.
  if (membership?.org_id) {
    const { error: orgDeleteError } = await admin.from("organizations").delete().eq("id", membership.org_id);
    if (orgDeleteError) {
      return NextResponse.json({ error: orgDeleteError.message }, { status: 500 });
    }
  }

  const { error: userDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (userDeleteError) {
    return NextResponse.json({ error: userDeleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
