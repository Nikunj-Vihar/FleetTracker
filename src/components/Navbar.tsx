"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Fuel,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import HelpButton from "./HelpButton";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/log", label: "Log Trip", icon: Fuel },
  { href: "/entries", label: "Entries", icon: ListChecks },
  { href: "/expenses", label: "Expenses", icon: Wrench },
  { href: "/vehicles", label: "Vehicles", icon: Truck },
  { href: "/drivers", label: "Drivers", icon: Users },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await signOut();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/70 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow">
            <Truck size={18} />
          </span>
          <span className="hidden text-sm sm:block">
            Fleet Fuel Log
            <span className="block text-[10px] font-normal uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Anomaly Tracker
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-brand-600 text-white shadow"
                      : "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
                  )}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <NotificationBell />
          <ThemeToggle />
          <HelpButton />

          {isSupabaseConfigured && (
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-900/5 md:hidden dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Toggle navigation menu"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/40 bg-white/90 px-4 py-2 backdrop-blur-md md:hidden dark:border-white/10 dark:bg-slate-950/90">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
