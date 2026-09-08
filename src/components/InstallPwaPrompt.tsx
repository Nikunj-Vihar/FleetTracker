"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

// Not yet in TS's DOM lib — Chrome/Edge/Android-only event that lets us
// defer and later trigger the native install prompt from our own button.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "pwa-install-dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Registers the offline app-shell service worker and, unless already
// installed or previously dismissed, shows a small install nudge: a real
// "Install" button on Chrome/Edge/Android (via beforeinstallprompt), or a
// manual "Share -> Add to Home Screen" hint on iOS, which has no install
// API for websites to hook into at all.
export default function InstallPwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline caching is a nice-to-have — never block the app on it.
      });
    }

    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === "1") return;
    setDismissed(false);

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      localStorage.setItem(DISMISS_KEY, "1");
      setDismissed(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:px-6">
      <div className="glass-panel-solid flex w-full max-w-md items-center gap-3 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          {showIosHint ? <Share2 size={16} /> : <Download size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Install Fleet Fuel Log</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {showIosHint
              ? 'Tap the Share icon, then "Add to Home Screen".'
              : "Add it to your home screen for quick, full-screen access."}
          </p>
        </div>
        {!showIosHint && (
          <button type="button" onClick={handleInstall} className="btn-primary shrink-0 px-3 py-1.5 text-xs">
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
