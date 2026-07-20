import dayjs from "dayjs";
import relative from "dayjs/plugin/relativeTime.js";
import { Box, Text, useInput } from "ink";
import { useAtomValue } from "jotai";
import React from "react";
import {
  useActorAlbums,
  useActorArtists,
  useActorScrobbles,
  useActorSongs,
  useCurrentUser,
  useStats,
} from "./queries";
import { Cell, Ell } from "./Columns";
import { authAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

dayjs.extend(relative);

const SECTION_LIMIT = 25;

export function ProfileView({
  height = 15,
  isActive = false,
}: {
  height?: number;
  isActive?: boolean;
}) {
  const token = useAtomValue(authAtom);
  const { data: profile, isLoading: profileLoading } = useCurrentUser(token);
  const did = profile?.did;

  async function openUrl(url: string) {
    try {
      const open = (await import("open")).default;
      await open(url);
    } catch {
      // nothing else to do in a terminal
    }
  }

  useInput(
    (input) => {
      if (!profile) return;
      if (input === "b") {
        openUrl(`https://bsky.app/profile/${profile.handle || profile.did}`);
      } else if (input === "d" && profile.did) {
        openUrl(`https://pdsls.dev/at://${profile.did}`);
      }
    },
    { isActive },
  );
  const recentQ = useActorScrobbles(token, did, SECTION_LIMIT);
  const tracksQ = useActorSongs(token, did, SECTION_LIMIT);
  const artistsQ = useActorArtists(token, did, SECTION_LIMIT);
  const albumsQ = useActorAlbums(token, did, SECTION_LIMIT);
  const statsQ = useStats(token, did);

  // Two sections stacked per column; show as many rows as vertically fit.
  const perSection = Math.max(4, Math.floor((height - 4) / 2));
  const data = {
    recent: (recentQ.data ?? []).slice(0, perSection),
    topTracks: (tracksQ.data ?? []).slice(0, perSection),
    topArtists: (artistsQ.data ?? []).slice(0, perSection),
    topAlbums: (albumsQ.data ?? []).slice(0, perSection),
  };
  const stats = statsQ.data ?? null;

  if (!token) {
    return (
      <Text color={VIOLET}>
        {"Not signed in. Press A to sign in and view your profile."}
      </Text>
    );
  }
  if (profileLoading) return <Text color={VIOLET}>Loading your profile…</Text>;

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={VIOLET}>
          {profile?.displayName || profile?.handle || "Unknown"}
        </Text>
        {profile?.handle ? <Text color={BLUE}>{`  @${profile.handle}`}</Text> : null}
      </Text>

      <Box marginTop={1} flexDirection="row">
        <Stat label="Scrobbles" value={stats?.scrobbles} />
        <Stat label="Artists" value={stats?.artists} />
        <Stat label="Albums" value={stats?.albums} />
        <Stat label="Tracks" value={stats?.tracks} />
        <Stat label="Loved" value={stats?.lovedTracks} />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>b open Bluesky profile · d open PDSLS repo</Text>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Box flexDirection="column" width="50%" paddingRight={2}>
          <Section title="Recent Scrobbles">
            {(data?.recent ?? []).map((s, i) => (
              <Box key={i}>
                <Cell grow>
                  <Ell bold>{s.title}</Ell>
                </Cell>
                <Cell width={16}>
                  <Ell dimColor>{s.artist}</Ell>
                </Cell>
                <Cell width={13} right>
                  <Ell color={TEAL}>
                    {s.createdAt ? dayjs(s.createdAt).fromNow() : ""}
                  </Ell>
                </Cell>
              </Box>
            ))}
          </Section>
          <Section title="Top Tracks">
            {(data?.topTracks ?? []).map((t, i) => (
              <Ranked key={i} rank={i + 1} primary={t.title} secondary={t.artist} plays={t.playCount} />
            ))}
          </Section>
        </Box>

        <Box flexDirection="column" width="50%">
          <Section title="Top Artists">
            {(data?.topArtists ?? []).map((a, i) => (
              <Ranked key={i} rank={i + 1} primary={a.name} plays={a.playCount} />
            ))}
          </Section>
          <Section title="Top Albums">
            {(data?.topAlbums ?? []).map((a, i) => (
              <Ranked key={i} rank={i + 1} primary={a.title} secondary={a.artist} plays={a.playCount} />
            ))}
          </Section>
        </Box>
      </Box>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Box flexDirection="column" marginRight={3}>
      <Text bold color={TEAL}>
        {value != null ? value.toLocaleString() : "—"}
      </Text>
      <Text dimColor>{label}</Text>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={BLUE}>
        {title}
      </Text>
      {React.Children.count(children) > 0 ? (
        children
      ) : (
        <Text dimColor>—</Text>
      )}
    </Box>
  );
}

function Ranked({
  rank,
  primary,
  secondary,
  plays,
}: {
  rank: number;
  primary: string;
  secondary?: string;
  plays?: number;
}) {
  return (
    <Box>
      <Cell width={4}>
        <Text color={VIOLET}>{`${rank}.`}</Text>
      </Cell>
      <Cell grow>
        <Ell bold>{primary}</Ell>
      </Cell>
      {secondary ? (
        <Cell width={16}>
          <Ell dimColor>{secondary}</Ell>
        </Cell>
      ) : null}
      <Cell width={11} right>
        <Ell color={TEAL}>{plays != null ? `${plays} plays` : ""}</Ell>
      </Cell>
    </Box>
  );
}
