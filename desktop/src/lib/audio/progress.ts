// Reconciling a locally-ticked progress estimate against an authoritative one.
//
// Every source reports elapsed time on its own schedule — the local engine on a
// 500ms poll, a remote device every ~2s, Spotify every 15s — while the UI ticks
// at 100ms so the bar moves smoothly in between. Overwriting the local estimate
// on every report makes the bar visibly jump; ignoring the report lets a
// permanent offset build up. Bend toward it instead.

/** Share of the error to take out per authoritative report. */
const SLEW_GAIN = 0.25;

/** Past this it isn't drift, it's a seek (or a track restart) — follow it. */
const RESYNC_MS = 2000;

/**
 * The progress to show, given what we've ticked to locally and what the source
 * says. Never returns less than `local`: a progress bar may stall for a moment
 * while it corrects, but it must never run backwards.
 */
export function reconcileProgress(local: number, authoritative: number): number {
  const error = authoritative - local;
  if (Math.abs(error) > RESYNC_MS) return authoritative;
  return Math.max(local, local + error * SLEW_GAIN);
}
