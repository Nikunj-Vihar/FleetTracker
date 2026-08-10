// Supabase client initialization. When NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY are not set, `supabase` is null and
// src/lib/store.ts transparently falls back to the LocalStorage engine so
// the app still runs standalone (CLAUDE.md "Offline Resilience").

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createBrowserClient(supabaseUrl as string, supabaseAnonKey as string);
  }
  return client;
}

export const supabase = getSupabaseClient();
