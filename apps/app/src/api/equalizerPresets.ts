import axios from "axios";
import { API_URL } from "../consts";
import { storage } from "../storage";
import type { EqBand } from "./audioSettings";

// app.rocksky.equalizer.{listPresets,putPreset,deletePreset}: saved EQ curves,
// each an atproto record whose rkey is the name slugified — saving under an
// existing name overwrites that preset. Applying one is an ordinary
// putAudioSettings write, the same path the sliders use.

export type EqualizerPreset = {
  /** AT-URI of the preset record. */
  uri: string;
  /** The name, slugified: lower case, dashes, no spaces. */
  rkey: string;
  name: string;
  /** Tenths of a dB, -240..0. */
  precut?: number;
  bands: EqBand[];
  createdAt: string;
  updatedAt?: string;
};

export type PutPresetInput = {
  name: string;
  precut?: number;
  bands: EqBand[];
};

const authHeaders = () => ({
  authorization: `Bearer ${storage.getToken()}`,
});

export const listEqualizerPresets = async (): Promise<EqualizerPreset[]> => {
  const response = await axios.get<{ presets?: EqualizerPreset[] }>(
    `${API_URL}/xrpc/app.rocksky.equalizer.listPresets`,
    { headers: authHeaders() },
  );
  return response.data?.presets ?? [];
};

export const saveEqualizerPreset = async (
  input: PutPresetInput,
): Promise<EqualizerPreset> => {
  const response = await axios.post<EqualizerPreset>(
    `${API_URL}/xrpc/app.rocksky.equalizer.putPreset`,
    input,
    { headers: authHeaders() },
  );
  return response.data;
};

export const deleteEqualizerPreset = async (rkey: string): Promise<void> => {
  await axios.post(
    `${API_URL}/xrpc/app.rocksky.equalizer.deletePreset`,
    {},
    { headers: authHeaders(), params: { rkey } },
  );
};
