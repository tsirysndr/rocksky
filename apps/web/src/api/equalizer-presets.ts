import type { EqualizerPresetView, PutPresetInput } from "@rocksky/sdk";
import { rocksky } from "../lib/rocksky";

// Wraps the app.rocksky.equalizer.{listPresets,putPreset,deletePreset} XRPC
// endpoints. Presets are atproto records under app.rocksky.equalizer with the
// slugified preset name as rkey (lower case, dashed, no spaces) — saving with
// an existing name overwrites that preset. Applying a preset goes through the
// regular putAudioSettings path (app.rocksky.rockbox.audio.settings).

export type { EqualizerPresetView, PutPresetInput };

/** The authenticated viewer's saved presets, sorted by name. */
export function listEqualizerPresets(): Promise<EqualizerPresetView[]> {
  return rocksky().equalizerPresets();
}

export function saveEqualizerPreset(
  input: PutPresetInput,
): Promise<EqualizerPresetView> {
  return rocksky().putEqualizerPreset(input);
}

export function deleteEqualizerPreset(rkey: string): Promise<void> {
  return rocksky().deleteEqualizerPreset(rkey);
}
