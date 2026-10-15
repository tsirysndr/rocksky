/** Track/disc positions in published records must be positive integers.
 * Clients and catalog providers sometimes use zero to mean unknown.
 * Normalize at publication so already-queued submissions are repaired too.
 */
export function recordPosition(value: number | null | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : 1;
}
