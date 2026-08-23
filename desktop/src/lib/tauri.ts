// Detects whether the app is running inside the Tauri desktop shell.
//
// All Tauri-only code paths (invoke, event listeners, opener) must be gated
// on this so the same source renders harmlessly in a plain browser (e.g.
// `vite dev` opened outside the Tauri window).
export const isTauri = () => "__TAURI_INTERNALS__" in window;
