/**
 * Key/BPM/fingerprint analysis for uploaded audio.
 *
 * Runs the @rocksky/analysis native (Rust/Neon) binding on the libuv worker
 * pool and fills tracks.key / tracks.bpm / tracks.acoustid_fingerprint. All
 * three come out of one decode pass, so the fingerprint costs nothing beyond
 * what key and tempo already pay for.
 *
 * Fire-and-forget by design: the upload response never waits on this, and
 * nothing here can fail an upload — a missing binding, a corrupt file or a DB
 * hiccup all end as a warning log.
 */

import { consola } from "consola";
import { ctx } from "context";
import { eq, sql } from "drizzle-orm";
import tables from "schema";

type AnalysisModule = typeof import("@rocksky/analysis");

// Lazy-loaded so the API still boots when the native module hasn't been
// built on this machine; analysis is then skipped, never crashed on.
let analysisModule: AnalysisModule | null | undefined;

export async function loadAnalysisModule(): Promise<AnalysisModule | null> {
  if (analysisModule !== undefined) return analysisModule;
  try {
    analysisModule = await import("@rocksky/analysis");
  } catch (e) {
    analysisModule = null;
    consola.warn(
      "[analysis] @rocksky/analysis native binding unavailable — key/bpm analysis disabled. Build it with `bun run build` in crates/analysis-node.",
      e,
    );
  }
  return analysisModule;
}

/**
 * Persist key/bpm/fingerprint on a track, filling only what is still missing —
 * a track is shared across users and sources, and an earlier answer is not
 * overwritten.
 */
export async function storeTrackAnalysis(
  trackId: string,
  key: string | null,
  bpm: number | null,
  fingerprint: string | null = null,
): Promise<void> {
  if (key == null && bpm == null && fingerprint == null) return;
  await ctx.db
    .update(tables.tracks)
    .set({
      key: sql`coalesce(${tables.tracks.key}, ${key})`,
      bpm: sql`coalesce(${tables.tracks.bpm}, ${bpm})`,
      acoustidFingerprint: sql`coalesce(${tables.tracks.acoustidFingerprint}, ${fingerprint})`,
    })
    .where(eq(tables.tracks.id, trackId));
}

/**
 * Analyze one upload and store the result. Called without await from the
 * upload route; the returned promise only ever rejects on programmer error,
 * expected failures are logged and swallowed here.
 */
export async function analyzeUploadAudio(
  buf: Buffer,
  extensionHint: string,
  trackId: string,
): Promise<void> {
  try {
    const analysis = await loadAnalysisModule();
    if (!analysis) return;

    const started = Date.now();
    const result = await analysis.analyze(buf, extensionHint);
    await storeTrackAnalysis(
      trackId,
      result.key,
      result.bpm,
      result.fingerprint,
    );

    consola.info(
      `[analysis] track ${trackId}: key=${result.key ?? "?"} bpm=${
        result.bpm?.toFixed(1) ?? "?"
      } fingerprint=${result.fingerprint ? "yes" : "no"} (${(
        (Date.now() - started) / 1000
      ).toFixed(1)}s)`,
    );
  } catch (e) {
    consola.warn(`[analysis] track ${trackId} failed:`, e);
  }
}
