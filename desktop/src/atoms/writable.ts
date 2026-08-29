import { atom } from "jotai";
import type { NfcWriteTarget } from "../components/WriteToNfcMenuItem";

/**
 * What the page on screen would write to a tag or card, if asked.
 *
 * The context menus name their subject by being attached to it; a keyboard
 * shortcut has no such anchor, so the page publishes what it is showing and the
 * global handler reads it. Null on a page with nothing writable, which is what
 * makes the shortcut a no-op there rather than acting on a stale subject.
 */
export const writableTargetAtom = atom<{
  target: NfcWriteTarget;
  label: string;
  sublabel?: string;
} | null>(null);
