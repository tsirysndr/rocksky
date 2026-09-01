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
 * says.
 *
 * Corrects in BOTH directions. Clamping this to forward-only (as it first did)
 * looks safer and is worse: the local tick can overshoot — one slow render and
 * `delta` covers 500ms in a single tick — and a forward-only correction can
 * never take that back, so the estimate ratchets ahead until it trips the
 * resync threshold and snaps back. Ratchet, snap, repeat. A small backward
 * nudge every report is invisible; the snap is not.
 */
export function reconcileProgress(local: number, authoritative: number): number {
  const error = authoritative - local;
  if (Math.abs(error) > RESYNC_MS) return authoritative;
  return local + error * SLEW_GAIN;
}
