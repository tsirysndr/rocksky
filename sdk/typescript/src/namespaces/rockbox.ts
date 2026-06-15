import type { PutAudioSettingsInput, RockboxSettingsView } from "../generated/types.js";
import type { RequestOptions } from "../types.js";
import type { Call } from "./_helpers.js";

export type { PutAudioSettingsInput, RockboxSettingsView };

export class RockboxNamespace {
  constructor(private readonly call: Call) {}

  getAudioSettings(opts?: RequestOptions): Promise<RockboxSettingsView> {
    return this.call("app.rocksky.rockbox.getAudioSettings", "GET", {
      requireAuth: true,
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
