import type { PutAudioSettingsInput, RockboxSettingsView } from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { PutAudioSettingsInput, RockboxSettingsView };

export class RockboxNamespace {
  constructor(private readonly call: Call) {}

  /**
   * Get Rockbox audio settings.
   * - Pass `did` to fetch any user's settings publicly (no auth needed).
   * - Omit `did` to fetch the authenticated caller's own settings (auth required).
   */
  getAudioSettings(
    params?: { did?: string },
    opts?: RequestOptions,
  ): Promise<RockboxSettingsView> {
    return this.call("app.rocksky.rockbox.getAudioSettings", "GET", {
      params,
      requireAuth: !params?.did,
      ...opts,
    }) as Promise<RockboxSettingsView>;
  }

  putAudioSettings(
    input: PutAudioSettingsInput,
    opts?: RequestOptions,
  ): Promise<RockboxSettingsView> {
    return this.call("app.rocksky.rockbox.putAudioSettings", "POST", {
      body: input,
      requireAuth: true,
      ...opts,
    }) as Promise<RockboxSettingsView>;
  }
}
