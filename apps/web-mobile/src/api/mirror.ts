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
  const data = await rocksky().mirrorSources();
  return (data.sources ?? []) as MirrorSourceView[];
};

export interface PutMirrorSourceInput {
  provider: MirrorProvider;
  enabled?: boolean;
  externalUsername?: string;
  apiKey?: string;
}

export const putMirrorSource = async (
  input: PutMirrorSourceInput,
): Promise<MirrorSourceView> => {
  const data = await rocksky().putMirrorSource(input);
  return data as MirrorSourceView;
};
