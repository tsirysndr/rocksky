import { client } from ".";

export type MirrorProvider = "lastfm" | "listenbrainz" | "tealfm";

export interface MirrorSourceView {
  provider: MirrorProvider;
  enabled: boolean;
  externalUsername?: string;
  hasCredentials: boolean;
  lastPolledAt?: string;
  lastScrobbleSeenAt?: string;
}

const authHeader = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

export const getMirrorSources = async (): Promise<MirrorSourceView[]> => {
  const res = await client.get<{ sources: MirrorSourceView[] }>(
    "/xrpc/app.rocksky.mirror.getMirrorSources",
    { headers: authHeader() },
  );
  return res.data.sources ?? [];
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
  const res = await client.post<MirrorSourceView>(
    "/xrpc/app.rocksky.mirror.putMirrorSource",
    input,
    { headers: authHeader() },
  );
  return res.data;
};
