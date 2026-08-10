export const THEME_STORAGE_KEY = "fleettracker-theme";

// Runs before hydration (injected as a raw <script> in the root layout) so
// the correct theme applies on first paint. An explicit prior choice wins;
// otherwise falls back to the OS-level preference.
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
