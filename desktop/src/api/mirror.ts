import { rocksky } from "../lib/rocksky";

export type MirrorProvider = "lastfm" | "listenbrainz" | "tealfm";

export interface MirrorSourceView {
  provider: MirrorProvider;
  enabled: boolean;
  externalUsername?: string;
  hasCredentials: boolean;
  lastPolledAt?: string;
  lastScrobbleSeenAt?: string;
}

export const getMirrorSources = async (): Promise<MirrorSourceView[]> => {
  const res = await rocksky().mirrorSources();
  return (res.sources ?? []) as MirrorSourceView[];
};

export interface PutMirrorSourceInput {
  provider: MirrorProvider;
  enabled?: boolean;
  externalUsername?: string;
  /** Omit to leave existing key unchanged. Empty string to clear. */
  apiKey?: string;
}

export const putMirrorSource = async (
  input: PutMirrorSourceInput,
): Promise<MirrorSourceView> => {
  const res = await rocksky().putMirrorSource(input);
  return res as MirrorSourceView;
};
