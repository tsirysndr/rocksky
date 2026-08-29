import { useSetAtom } from "jotai";
import { useEffect } from "react";
import type { NfcWriteTarget } from "../components/WriteToNfcMenuItem";
import { writableTargetAtom } from "../atoms/writable";

/**
 * Publish what this page would write to a tag or card, for the T shortcut.
 *
 * Cleared on unmount, so leaving a page takes its subject with it and the
 * shortcut cannot act on something no longer on screen.
 *
 * `writable` is expected to be null while the page is still loading; passing it
 * through unchanged is what keeps the shortcut inert until there is something
 * real to write.
 */
export function useWritable(
  writable: { target: NfcWriteTarget; label: string; sublabel?: string } | null,
) {
  const publish = useSetAtom(writableTargetAtom);

  // Depend on the parts rather than the object: callers build it inline, so a
  // fresh identity every render would republish on every render.
  const { target, label, sublabel } = writable ?? {};
  const key = target ? JSON.stringify(target) : null;

  useEffect(() => {
    publish(target && label ? { target, label, sublabel } : null);
    return () => publish(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, label, sublabel, publish]);
}
