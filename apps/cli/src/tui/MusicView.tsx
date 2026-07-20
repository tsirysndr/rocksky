import { useQuery } from "@tanstack/react-query";
import { RockskyClient } from "client";
import { Box, Text, useInput } from "ink";
import { useAtom, useAtomValue } from "jotai";
import React, { useEffect, useState } from "react";
import { Cell, Ell } from "./Columns";
import { fmtDuration } from "./format";
import { likedUrisAtom, useToggleLike } from "./likes";
import { List } from "./List";
import { enqueueAt, enqueueLast, enqueueNext, streamAndPlay } from "./playback";
import { INSERT_MODES, type QueueItem } from "./player";
import { authAtom, playbackMessageAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

type Mode = "tracks" | "albums" | "artists";
const MODES: Mode[] = ["tracks", "albums", "artists"];
const MODE_LABELS: Record<Mode, string> = {
  tracks: "Tracks",
  albums: "Albums",
  artists: "Artists",
};

interface TrackItem extends QueueItem {
  kind: "track";
}
interface AlbumItem {
  kind: "album";
  album: string;
  albumArtist: string;
  albumUri?: string;
  trackCount: number;
}
interface ArtistItem {
  kind: "artist";
  name: string;
  albumCount: number;
  trackCount: number;
}
type Row = TrackItem | AlbumItem | ArtistItem;

type Drill =
  | { type: "album"; label: string; albumArtist?: string; albumName?: string; albumUri?: string }
  | { type: "artist"; label: string; name: string };

export function MusicView({
  isActive,
  height = 15,
}: {
  isActive: boolean;
  height?: number;
}) {
  const token = useAtomValue(authAtom);
  const likedUris = useAtomValue(likedUrisAtom);
  const toggleLike = useToggleLike(token);
  const [mode, setMode] = useState<Mode>("tracks");
  const [drill, setDrill] = useState<Drill[]>([]);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useAtom(playbackMessageAtom);
  // When set, the insert-mode menu is open for these tracks.
  const [insertMenu, setInsertMenu] = useState<{
    tracks: QueueItem[];
    label: string;
    sel: number;
  } | null>(null);

  const top = drill[drill.length - 1];
  const drillKey = drill.map((d) => `${d.type}:${d.label}`).join(">");

  const {
    data: items = [],
    isLoading: loading,
    error,
  } = useQuery<Row[]>({
    queryKey: ["library", token, mode, drillKey],
    enabled: !!token,
    queryFn: async () => {
      const client = new RockskyClient(token);
      if (top?.type === "album") {
        const rows = await client.getUploads({
          limit: 500,
          albumUri: top.albumUri,
          albumArtist: top.albumUri ? undefined : top.albumArtist,
          albumName: top.albumUri ? undefined : top.albumName,
        });
        return (rows || []).map(toTrack);
      }
      if (top?.type === "artist") {
        const rows = await client.getUploadAlbums({ limit: 500 });
        return (rows || []).map(toAlbum).filter((a) => a.albumArtist === top.name);
      }
      if (mode === "albums") return (await client.getUploadAlbums({ limit: 500 })).map(toAlbum);
      if (mode === "artists") return (await client.getUploadArtists({ limit: 500 })).map(toArtist);
      return (await client.getUploads({ limit: 500 })).map(toTrack);
    },
  });

  // Reset the cursor whenever we move to a different screen.
  useEffect(() => {
    setSelected(0);
  }, [mode, drillKey]);

  async function playFrom(tracks: TrackItem[], index: number) {
    if (tracks.length === 0 || !token) return;
    try {
      setMessage("Buffering…");
      await streamAndPlay(token, tracks, index);
      setMessage("");
    } catch (e: any) {
      setMessage(`Playback error: ${e.message}`);
    }
  }

  // Resolve the selected row to a concrete list of tracks (fetching album /
  // artist contents as needed).
  async function resolveTracks(row: Row): Promise<QueueItem[]> {
    const client = new RockskyClient(token);
    if (row.kind === "track") return [stripKind(row)];
    if (row.kind === "album") {
      const rows = await client.getUploads({
        limit: 500,
        albumUri: row.albumUri,
        albumArtist: row.albumUri ? undefined : row.albumArtist,
        albumName: row.albumUri ? undefined : row.album,
      });
      return (rows || []).map((r: any) => stripKind(toTrack(r)));
    }
    // artist → every track across the artist's albums
    const albums = (await client.getUploadAlbums({ limit: 500 }))
      .map(toAlbum)
      .filter((a: AlbumItem) => a.albumArtist === row.name);
    const lists = await Promise.all(
      albums.map((a) =>
        client
          .getUploads({
            limit: 500,
            albumUri: a.albumUri,
            albumArtist: a.albumUri ? undefined : a.albumArtist,
            albumName: a.albumUri ? undefined : a.album,
          })
          .then((rows: any[]) => (rows || []).map((r) => stripKind(toTrack(r))))
          .catch(() => []),
      ),
    );
    return lists.flat();
  }

  async function withResolved(
    row: Row,
    action: (tracks: QueueItem[]) => Promise<void> | void,
  ) {
    if (!token) return;
    try {
      setMessage("Loading…");
      const tracks = await resolveTracks(row);
      setMessage("");
      await action(tracks);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    }
  }

  function onEnter() {
    const cur = items[selected];
    if (!cur) return;
    if (cur.kind === "track") {
      const tracks = items.filter((i): i is TrackItem => i.kind === "track");
      playFrom(tracks, tracks.indexOf(cur));
    } else if (cur.kind === "album") {
      setDrill((d) => [
        ...d,
        {
          type: "album",
          label: cur.album,
          albumArtist: cur.albumArtist,
          albumName: cur.album,
          albumUri: cur.albumUri,
        },
      ]);
    } else if (cur.kind === "artist") {
      setDrill((d) => [...d, { type: "artist", label: cur.name, name: cur.name }]);
    }
  }

  function cycleMode(delta: number) {
    if (drill.length) {
      setDrill([]);
      return;
    }
    const idx = MODES.indexOf(mode);
    setMode(MODES[(idx + delta + MODES.length) % MODES.length]);
  }

  function rowLabel(row: Row): string {
    if (row.kind === "track") return row.title;
    if (row.kind === "album") return row.album;
    return row.name;
  }

  useInput(
    (input, key) => {
      // Insert-mode menu takes over input while open.
      if (insertMenu) {
        if (key.escape) return setInsertMenu(null);
        if (key.upArrow || input === "k")
          return setInsertMenu((m) =>
            m ? { ...m, sel: Math.max(0, m.sel - 1) } : m,
          );
        if (key.downArrow || input === "j")
          return setInsertMenu((m) =>
            m ? { ...m, sel: Math.min(INSERT_MODES.length - 1, m.sel + 1) } : m,
          );
        if (key.return) {
          const menu = insertMenu;
          const chosen = INSERT_MODES[menu.sel];
          setInsertMenu(null);
          if (token) {
            setMessage(`${chosen.label}…`);
            enqueueAt(token, menu.tracks, chosen.pos)
              .then(() => setMessage(""))
              .catch((e) => setMessage(`Error: ${e.message}`));
          }
        }
        return;
      }

      if (key.upArrow || input === "k") setSelected((s) => Math.max(0, s - 1));
      else if (key.downArrow || input === "j")
        setSelected((s) => Math.min(items.length - 1, s + 1));
      else if (key.return) onEnter();
      else if (key.escape || key.backspace || key.delete)
        setDrill((d) => d.slice(0, -1));
      else if (key.leftArrow) cycleMode(-1);
      else if (key.rightArrow) cycleMode(1);
      else if (input === "a") {
        const cur = items[selected];
        if (cur) withResolved(cur, (tracks) => playFrom(tracks as TrackItem[], 0));
      } else if (input === "N") {
        const cur = items[selected];
        if (cur && token)
          withResolved(cur, (tracks) => enqueueNext(token, tracks));
      } else if (input === "L") {
        const cur = items[selected];
        if (cur && token)
          withResolved(cur, (tracks) => enqueueLast(token, tracks));
      } else if (input === "i") {
        const cur = items[selected];
        if (cur)
          withResolved(cur, (tracks) =>
            setInsertMenu({ tracks, label: rowLabel(cur), sel: 0 }),
          );
      } else if (input === "P") {
        // Play ONLY the selected track (single-item queue).
        const cur = items[selected];
        if (cur?.kind === "track") playFrom([cur], 0);
      } else if (input === "f") {
        // Like / unlike the selected track.
        const cur = items[selected];
        if (cur?.kind === "track") void toggleLike(cur.uri);
      }
    },
    { isActive },
  );

  if (!token) {
    return (
      <Text color={VIOLET}>
        {"You are not logged in. Run `rocksky login <handle>` to browse and stream your uploaded music."}
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        {MODES.map((m) => {
          const activeTab = m === mode && drill.length === 0;
          return (
            <Text
              key={m}
              bold={activeTab}
              inverse={activeTab}
              color={activeTab ? BLUE : undefined}
              dimColor={!activeTab}
            >
              {` ${MODE_LABELS[m]} `}
            </Text>
          );
        })}
        {drill.length > 0 ? (
          <Text color={TEAL}>{`   › ${drill.map((d) => d.label).join(" › ")}`}</Text>
        ) : null}
      </Box>

      {insertMenu ? (
        <Box flexDirection="column">
          <Text>
            <Text color={BLUE} bold>
              {"Add to queue: "}
            </Text>
            <Text bold>{insertMenu.label}</Text>
            <Text dimColor>{`  (${insertMenu.tracks.length} track${insertMenu.tracks.length === 1 ? "" : "s"})`}</Text>
          </Text>
          <Box flexDirection="column" marginTop={1}>
            {INSERT_MODES.map((m, i) => (
              <Text key={m.pos}>
                <Text color={i === insertMenu.sel ? BLUE : VIOLET}>
                  {i === insertMenu.sel ? "› " : "  "}
                </Text>
                <Text bold={i === insertMenu.sel}>{m.label}</Text>
              </Text>
            ))}
          </Box>
          <Text dimColor>{"↑/↓ choose · Enter apply · Esc cancel"}</Text>
        </Box>
      ) : loading ? (
        <Text color={VIOLET}>Loading…</Text>
      ) : error ? (
        <Text color="red">Error: {(error as Error).message}</Text>
      ) : mode === "tracks" && drill.length === 0 && items.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <List
          items={items}
          selected={selected}
          height={height}
          emptyText="Nothing here yet."
          renderItem={(row, _idx, active) => (
            <RowLine
              row={row}
              active={active}
              liked={row.kind === "track" && !!row.uri && likedUris.has(row.uri)}
            />
          )}
        />
      )}

      {message ? <Text color={BLUE}>{message}</Text> : null}
    </Box>
  );
}

function stripKind(t: TrackItem): QueueItem {
  const { kind, ...rest } = t;
  return rest;
}

function EmptyLibrary() {
  return (
    <Box flexDirection="column">
      <Text color={VIOLET} bold>
        Your library is empty.
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Upload audio files from the command line:</Text>
        <Text color={TEAL}>{"  rocksky upload <files or folders…>"}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>
            Supported: mp3, flac, m4a, ogg, wav, aiff (files must be tagged).
          </Text>
          <Text dimColor>
            Uploaded tracks are private — only you can see and stream them.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function RowLine({
  row,
  active,
  liked,
}: {
  row: Row;
  active: boolean;
  liked?: boolean;
}) {
  const marker = (
    <Cell width={2}>
      <Text color={active ? BLUE : VIOLET}>{active ? "▶" : " "}</Text>
    </Cell>
  );

  if (row.kind === "track") {
    return (
      <>
        {marker}
        <Cell grow>
          <Ell color={active ? BLUE : undefined} bold>
            {liked ? "♥ " : ""}
            {row.title}
          </Ell>
        </Cell>
        <Cell width={24}>
          <Ell dimColor>{row.artist}</Ell>
        </Cell>
        <Cell width={18}>
          <Ell dimColor>{row.album ?? ""}</Ell>
        </Cell>
        <Cell width={6} right>
          <Ell color={TEAL}>{row.duration ? fmtDuration(row.duration) : ""}</Ell>
        </Cell>
      </>
    );
  }

  if (row.kind === "album") {
    return (
      <>
        {marker}
        <Cell grow>
          <Ell color={active ? BLUE : undefined} bold>
            {row.album}
          </Ell>
        </Cell>
        <Cell width={24}>
          <Ell dimColor>{row.albumArtist}</Ell>
        </Cell>
        <Cell width={11} right>
          <Ell color={TEAL}>{`${row.trackCount} track${row.trackCount === 1 ? "" : "s"}`}</Ell>
        </Cell>
      </>
    );
  }

  return (
    <>
      {marker}
      <Cell grow>
        <Ell color={active ? BLUE : undefined} bold>
          {row.name}
        </Ell>
      </Cell>
      <Cell width={22} right>
        <Ell color={TEAL}>{`${row.albumCount} alb · ${row.trackCount} trk`}</Ell>
      </Cell>
    </>
  );
}

const toTrack = (r: any): TrackItem => ({
  kind: "track",
  uploadId: r.upload.id,
  title: r.track.title,
  artist: r.track.artist,
  album: r.track.album,
  albumArtist: r.track.albumArtist,
  albumArt: r.track.albumArt,
  duration: r.track.duration,
  mimeType: r.upload.mimeType,
  uri: r.track.uri,
});

const toAlbum = (r: any): AlbumItem => ({
  kind: "album",
  album: r.album,
  albumArtist: r.albumArtist,
  albumUri: r.albumUri || undefined,
  trackCount: r.trackCount ?? 0,
});

const toArtist = (r: any): ArtistItem => ({
  kind: "artist",
  name: r.name,
  albumCount: r.albumCount ?? 0,
  trackCount: r.trackCount ?? 0,
});
