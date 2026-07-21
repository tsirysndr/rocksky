import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { RockskyClient } from "client";
import { Box, Text, useInput } from "ink";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useState } from "react";
import { Cell, Ell } from "./Columns";
import { fmtDuration } from "./format";
import { likedIdsAtom, useToggleLike } from "./likes";
import { List } from "./List";
import { getCreds, getStarred } from "./navidrome";
import { enqueueAt, streamAndPlay } from "./playback";
import { INSERT_MODES, type QueueItem } from "./player";
import { PlaylistsView } from "./PlaylistsView";
import { queryClient } from "./queryClient";
import { shuffled } from "./shuffle";
import { addToPlaylistAtom, authAtom, playbackMessageAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

const PAGE_SIZE = 100;

type Mode = "tracks" | "albums" | "artists" | "favorites" | "playlists";
const MODES: Mode[] = ["tracks", "albums", "artists", "favorites", "playlists"];
const MODE_LABELS: Record<Mode, string> = {
  tracks: "Tracks",
  albums: "Albums",
  artists: "Artists",
  favorites: "Favorites",
  playlists: "Playlists",
};

interface TrackItem extends QueueItem {
  kind: "track";
  trackNumber?: number;
  discNumber?: number;
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
  const likedIds = useAtomValue(likedIdsAtom);
  const toggleLike = useToggleLike(token);
  const setAddToPlaylist = useSetAtom(addToPlaylistAtom);
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
  // A track/album pending delete confirmation.
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "track"; trackId: string; label: string }
    | { kind: "album"; albumUri?: string; albumArtist: string; album: string; label: string }
    | null
  >(null);

  const top = drill[drill.length - 1];
  const drillKey = drill.map((d) => `${d.type}:${d.label}`).join(">");

  // Navidrome credentials (for Favorites) — created/cached on first use.
  const { data: creds } = useQuery({
    queryKey: ["ndCreds", token],
    enabled: !!token,
    queryFn: () => getCreds(token),
  });

  const {
    data,
    isLoading: loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<Row[]>({
    queryKey: ["library", token, mode, drillKey],
    enabled:
      !!token && mode !== "playlists" && (mode !== "favorites" || !!creds),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const client = new RockskyClient(token);
      const skip = pageParam as number;
      // Playlists render their own view; no library rows here.
      if (mode === "playlists") return [];
      // Favorites come from the Navidrome starred API (single page).
      if (mode === "favorites") {
        if (skip > 0 || !creds) return [];
        const songs = await getStarred(creds);
        return songs.map(toFavTrack);
      }
      // Drill-down lists are bounded → fetched in a single page.
      if (top?.type === "album") {
        if (skip > 0) return [];
        const rows = await client.getUploads({
          limit: 500,
          albumUri: top.albumUri,
          albumArtist: top.albumUri ? undefined : top.albumArtist,
          albumName: top.albumUri ? undefined : top.albumName,
        });
        // Order by disc then track number so multi-disc albums group correctly.
        return (rows || [])
          .map(toTrack)
          .sort(
            (a, b) =>
              (a.discNumber ?? 1) - (b.discNumber ?? 1) ||
              (a.trackNumber ?? 0) - (b.trackNumber ?? 0),
          );
      }
      if (top?.type === "artist") {
        if (skip > 0) return [];
        const rows = await client.getUploadAlbums({ limit: 500 });
        return (rows || []).map(toAlbum).filter((a) => a.albumArtist === top.name);
      }
      // Top-level lists paginate.
      if (mode === "albums")
        return (await client.getUploadAlbums({ skip, limit: PAGE_SIZE })).map(toAlbum);
      if (mode === "artists")
        return (await client.getUploadArtists({ skip, limit: PAGE_SIZE })).map(toArtist);
      return (await client.getUploads({ skip, limit: PAGE_SIZE })).map(toTrack);
    },
    getNextPageParam: (lastPage, allPages) => {
      if (drill.length > 0 || mode === "favorites") return undefined; // single page
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((n, p) => n + p.length, 0);
    },
  });

  const items: Row[] = data ? data.pages.flat() : [];

  // In an album drill, detect whether it spans multiple discs (to show headers).
  const inAlbum = top?.type === "album";
  const multiDisc =
    inAlbum &&
    new Set(
      items
        .filter((i): i is TrackItem => i.kind === "track")
        .map((t) => t.discNumber ?? 1),
    ).size > 1;

  // Reset the cursor whenever we move to a different screen.
  useEffect(() => {
    setSelected(0);
  }, [mode, drillKey]);

  // Infinite scroll: load the next page as the cursor nears the end.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && selected >= items.length - 15) {
      fetchNextPage();
    }
  }, [selected, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function runDelete(target: NonNullable<typeof confirmDelete>) {
    if (!token) return;
    try {
      setMessage("Deleting…");
      const client = new RockskyClient(token);
      if (target.kind === "track") {
        await client.deleteUploadByTrack(target.trackId);
      } else {
        await client.deleteUploadAlbum({
          albumUri: target.albumUri,
          albumArtist: target.albumUri ? undefined : target.albumArtist,
          albumName: target.albumUri ? undefined : target.album,
        });
      }
      setMessage("");
      // Refresh every My Music list so the removed item disappears.
      queryClient.invalidateQueries({ queryKey: ["library"] });
    } catch (e: any) {
      setMessage(`Delete failed: ${e.message}`);
    }
  }

  async function playFrom(tracks: TrackItem[], index: number) {
    if (tracks.length === 0 || !token) return;
    try {
      setMessage("Buffering…");
      // streamAndPlay resolves every kind of track: uploads stream through the
      // uploads endpoint, favorites (no upload id) via the Navidrome API, and
      // anything already cached plays straight from disk.
      await streamAndPlay(token, tracks, index);
      setMessage("");
    } catch (e: any) {
      setMessage(`Playback error: ${e.message}`);
    }
  }

  // Add tracks to the queue at `position`, routing favorites through Navidrome.
  async function enqueueSmart(tracks: QueueItem[], position: number) {
    if (tracks.length === 0) return;
    try {
      setMessage("Queuing…");
      if (token) await enqueueAt(token, tracks, position);
      setMessage("");
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
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
      // Delete confirmation takes over input while open.
      if (confirmDelete) {
        if (key.return || input === "y" || input === "Y") {
          const target = confirmDelete;
          setConfirmDelete(null);
          void runDelete(target);
        } else if (key.escape || input === "n" || input === "N") {
          setConfirmDelete(null);
        }
        return;
      }

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
          void enqueueSmart(menu.tracks, chosen.pos);
        }
        return;
      }

      // Playlists sub-tab: only sub-tab switching is handled here — the embedded
      // PlaylistsView owns navigation / create / delete.
      if (mode === "playlists") {
        if (key.leftArrow) cycleMode(-1);
        else if (key.rightArrow) cycleMode(1);
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
        if (cur) withResolved(cur, (tracks) => enqueueSmart(tracks, 2));
      } else if (input === "L") {
        const cur = items[selected];
        if (cur) withResolved(cur, (tracks) => enqueueSmart(tracks, 3));
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
      } else if (input === "S") {
        // Play the whole visible track list in shuffled order.
        const tracks = items.filter((i): i is TrackItem => i.kind === "track");
        if (tracks.length) playFrom(shuffled(tracks), 0);
      } else if (input === "f") {
        // Like / unlike the selected track via Navidrome.
        const cur = items[selected];
        if (cur?.kind === "track") void toggleLike(cur.trackId);
      } else if (input === ";") {
        // Add the selected track to a playlist.
        const cur = items[selected];
        if (cur?.kind === "track" && cur.trackId)
          setAddToPlaylist({ trackId: cur.trackId, title: cur.title });
      } else if (input === "d" || input === "x") {
        // Delete the selected uploaded track or album (with confirmation).
        const cur = items[selected];
        if (cur?.kind === "track" && cur.trackId) {
          setConfirmDelete({
            kind: "track",
            trackId: cur.trackId,
            label: `${cur.title} — ${cur.artist}`,
          });
        } else if (cur?.kind === "album") {
          setConfirmDelete({
            kind: "album",
            albumUri: cur.albumUri,
            albumArtist: cur.albumArtist,
            album: cur.album,
            label: `${cur.album} — ${cur.albumArtist}`,
          });
        }
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

      {confirmDelete ? (
        <Box flexDirection="column">
          <Text bold color="#FF5F87">
            {confirmDelete.kind === "album" ? "Delete album" : "Delete track"}
          </Text>
          <Box marginTop={1}>
            <Text>
              {"Permanently delete "}
              <Text bold color={VIOLET}>
                {confirmDelete.label}
              </Text>
              {confirmDelete.kind === "album"
                ? " and all its uploaded tracks? This cannot be undone."
                : " from your library? This cannot be undone."}
            </Text>
          </Box>
          <Text dimColor>y / Enter to delete · n / Esc to cancel</Text>
        </Box>
      ) : insertMenu ? (
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
      ) : mode === "playlists" ? (
        <PlaylistsView isActive={isActive} height={height} />
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
          renderItem={(row, idx, active) => {
            const liked =
              row.kind === "track" &&
              !!row.trackId &&
              likedIds.has(row.trackId);
            if (inAlbum && row.kind === "track") {
              const prev = items[idx - 1];
              const disc = row.discNumber ?? 1;
              const prevDisc =
                prev?.kind === "track" ? (prev.discNumber ?? 1) : undefined;
              return (
                <AlbumTrackRow
                  row={row}
                  active={active}
                  liked={liked}
                  discHeader={multiDisc && disc !== prevDisc ? disc : null}
                />
              );
            }
            return <RowLine row={row} active={active} liked={liked} />;
          }}
        />
      )}

      {isFetchingNextPage ? <Text dimColor>Loading more…</Text> : null}
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

// Album-drill track row: an optional "Disc N" header, then the track with its
// number.
function AlbumTrackRow({
  row,
  active,
  liked,
  discHeader,
}: {
  row: TrackItem;
  active: boolean;
  liked?: boolean;
  discHeader: number | null;
}) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {discHeader != null ? (
        <Text bold color={TEAL}>{`  Disc ${discHeader}`}</Text>
      ) : null}
      <Box width="100%">
        <Cell width={2}>
          <Text color={active ? BLUE : VIOLET}>{active ? "▶" : " "}</Text>
        </Cell>
        <Cell width={3} right>
          <Text dimColor>{row.trackNumber != null ? `${row.trackNumber}` : ""}</Text>
        </Cell>
        <Cell grow>
          <Ell color={active ? BLUE : undefined} bold>
            {row.title}
          </Ell>
        </Cell>
        <Cell width={2}>
          <Text color={TEAL}>{liked ? "♥" : " "}</Text>
        </Cell>
        <Cell width={32}>
          <Ell dimColor>{row.artist}</Ell>
        </Cell>
        <Cell width={6} right>
          <Ell color={TEAL}>{row.duration ? fmtDuration(row.duration) : ""}</Ell>
        </Cell>
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
            {row.title}
          </Ell>
        </Cell>
        <Cell width={2}>
          <Text color={TEAL}>{liked ? "♥" : " "}</Text>
        </Cell>
        <Cell width={34}>
          <Ell dimColor>{row.artist}</Ell>
        </Cell>
        <Cell width={16}>
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
  trackId: r.track.id,
  trackNumber: r.track.trackNumber ?? undefined,
  discNumber: r.track.discNumber ?? undefined,
});

// A Navidrome starred song → a track row (streamed via Navidrome, no uploadId).
const toFavTrack = (s: any): TrackItem => ({
  kind: "track",
  uploadId: "",
  trackId: s.id,
  title: s.title,
  artist: s.artist,
  album: s.album,
  duration: s.duration ? s.duration * 1000 : undefined,
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
