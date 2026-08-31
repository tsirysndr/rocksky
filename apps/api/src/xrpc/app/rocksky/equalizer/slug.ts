// Preset name → rkey: lower case, dashed, no spaces (e.g. "Bass Boost" →
// "bass-boost"). Must stay stable — the rkey is the preset's identity, so the
// same name always overwrites the same record.
export function presetRkey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}
