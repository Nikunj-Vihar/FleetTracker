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

export async function signOut(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}
