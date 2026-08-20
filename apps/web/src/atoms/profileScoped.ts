import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback } from "react";

/**
 * Builds a hook for a piece of profile UI state (selected tab, time range, ...)
 * that is persisted to localStorage **per profile did**, so it survives both
 * navigation and a page reload.
 *
 * Every profile keeps its own value — nothing is inherited from another
 * profile. When no did is available (yet) the entry of the logged-in user is
 * used, so the current user's own profile is the default scope.
 */
export function createProfileScopedState<T>(storageKey: string, fallback: T) {
  const stateAtom = atomWithStorage<Record<string, T>>(
    storageKey,
    {},
    undefined,
    // Read localStorage synchronously on init, otherwise the first render uses
    // the fallback and the tab/range visibly flickers after a reload.
    { getOnInit: true },
  );

  return function useProfileScopedState(
    did?: string,
  ): [T, (value: T, forDid?: string) => void] {
    const [state, setState] = useAtom(stateAtom);
    const currentDid = localStorage.getItem("did") || undefined;

    const key = did || currentDid;
    const value = (key ? state[key] : undefined) ?? fallback;

    const setValue = useCallback(
      (next: T, forDid?: string) => {
        const target = forDid || did || currentDid;
        if (!target) {
          return;
        }
        setState((prev) => ({ ...prev, [target]: next }));
      },
      [did, currentDid, setState],
    );

    return [value, setValue];
  };
}
