"use client";

// Auth helpers. When Supabase is configured, identity comes from a real
// Supabase Auth session (see middleware.ts for route protection). When
// running standalone against LocalStorage, there is no real auth backend —
// audit trail attribution instead falls back to a locally-stored operator
// name, so "who changed this" still means something offline.

import { useEffect, useState } from "react";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export interface CurrentUser {
  id: string;
  label: string;
}

const LOCAL_OPERATOR_KEY = "fleettracker.operatorName";

export function getLocalOperatorName(): string {
  if (typeof window === "undefined") return "Local User";
  return window.localStorage.getItem(LOCAL_OPERATOR_KEY) || "Local User";
}

export function setLocalOperatorName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_OPERATOR_KEY, name.trim() || "Local User");
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setUser({ id: "local", label: getLocalOperatorName() });
      setLoading(false);
      return;
    }

    const client = getSupabaseClient()!;
    client.auth.getSession().then(({ data }) => {
      const session = data.session;
      setUser(session ? { id: session.user.id, label: session.user.email ?? session.user.id } : null);
      setLoading(false);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session ? { id: session.user.id, label: session.user.email ?? session.user.id } : null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// org_name lands in the new user's raw_user_meta_data, which
// handle_new_user() (08_signup_trigger.sql) reads to name the fresh
// organization it creates for them — sign-up and "get your own
// isolated fleet" are the same action, no separate admin step.
// Returns whether a session came back immediately: false means
// Supabase's email-confirmation setting is on and the caller should
// show a "check your email" message instead of redirecting.
export async function signUpWithPassword(email: string, password: string, orgName: string): Promise<{ hasSession: boolean }> {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { org_name: orgName } },
  });
  if (error) throw error;
  return { hasSession: data.session != null };
}

export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}
