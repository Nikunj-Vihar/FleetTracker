// Tracks when the notification bell was last opened, purely client-side —
// this is a "have I looked at this" marker for one browser, not shared
// state that needs a database table or to sync across devices.

const LAST_SEEN_KEY = "fleettracker.flagsLastSeenAt";

export function getFlagsLastSeenAt(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_SEEN_KEY);
}

export function markFlagsSeenNow(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
}
