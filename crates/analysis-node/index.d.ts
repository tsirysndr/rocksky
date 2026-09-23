/** What analysis knows about one track. */
export interface AudioAnalysis {
  /** Beats per minute, or null when no tempo could be found. */
  bpm: number | null;
  /** How much to believe the bpm, 0–1. */
  bpmConfidence: number | null;
  /** Musical key in traditional notation (e.g. "Fm"), or null. */
  key: string | null;
  /** How much to believe the key, 0–1. */
  keyConfidence: number | null;
  /**
   * AcoustID (Chromaprint) fingerprint of the opening two minutes, base64url
   * as `fpcalc` prints it. Null when the file was too short to fingerprint.
   */
  fingerprint: string | null;
  /** Seconds, as decoded rather than as the tags claim. */
  duration: number;
}

export interface AnalyzeBatchItem {
  /** Opaque caller id, echoed back in progress events and results. */
  id?: string;
  buffer: Buffer;
  /** File extension ("mp3", "flac", …) to help the prober; optional. */
  extensionHint?: string | null;
}

/** Fired on the JS thread as each track finishes, in completion order. */
export interface AnalyzeBatchProgress {
  id: string | null;
  /** Position of this item in the input array. */
  index: number;
  /** How many items have finished so far, including this one. */
  completed: number;
  total: number;
  ok: boolean;
  bpm: number | null;
  key: string | null;
  /** Whether a fingerprint came out; the fingerprint itself is in the result. */
  fingerprint: boolean;
  error: string | null;
}

export interface AnalyzeBatchResult {
  id: string | null;
  ok: boolean;
  analysis: AudioAnalysis | null;
  error: string | null;
}

/**
 * Analyse one track on Node's libuv worker pool. Non-blocking: the event
 * loop is never held while the audio decodes.
 */
export function analyze(
  buffer: Buffer,
  extensionHint?: string | null,
): Promise<AudioAnalysis>;

/**
 * Analyse many tracks in parallel across all cores (rayon thread pool on a
 * dedicated thread). Results come back in input order; `onProgress` fires
 * once per track as it finishes.
 */
export function analyzeBatch(
  items: AnalyzeBatchItem[],
  onProgress?: (progress: AnalyzeBatchProgress) => void,
): Promise<AnalyzeBatchResult[]>;
