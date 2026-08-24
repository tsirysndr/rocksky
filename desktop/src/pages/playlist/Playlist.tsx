import styled from "@emotion/styled";
import { uriToPath } from "../../lib/uri";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { IconArrowLeft, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  Link as DefaultLink,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";
import { HeadingMedium, LabelMedium } from "baseui/typography";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContentLoader from "react-content-loader";
import PlaylistCover from "../../components/PlaylistCover";
import { GhostButton, PillLink } from "../../components/PillButton";
import PlaylistSearch from "../../components/PlaylistSearch";
import { useTimeFormat } from "../../hooks/useFormat";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  addSongsTargetAtom,
  createPlaylistModalOpenAtom,
  pendingPlaylistTracksAtom,
} from "../../atoms/createPlaylist";
import { profileAtom } from "../../atoms/profile";
import usePlaylists, {
  usePlaylistQuery,
  useRemoveTrackFromPlaylistMutation,
} from "../../hooks/usePlaylists";
import Main from "../../layouts/Main";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-bottom: 8px;
  border: none;
  border-radius: 50%;
  background: var(--color-default-button);
  color: var(--color-text);
  cursor: pointer;

  &:hover {
    background: var(--color-menu-hover);
  }
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;


const RowAction = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;

  tr:hover &,
  &:focus-visible {
    opacity: 1;
  }

  &:hover {
    color: var(--color-primary);
    background: var(--color-default-button);
  }

  &:disabled {
    cursor: default;
    opacity: 0.4;
  }
`;

const Link = styled(DefaultLink)`
  color: inherit;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

type Row = {
  id: string;
  index: number;
  title: string;
  artist: string;
  albumArtist: string;
  albumArt: string;
  albumUri: string;
  artistUri: string;
  scrobbleUri: string;
  duration: number;
  trackNumber: number;
  uri: string;
};

function Playlist() {
  const { did, rkey } = useParams({ strict: false });
  const { formatTime, formatDuration } = useTimeFormat();
  const [playlist, setPlaylist] = useState<{
    id: string;
    name: string;
    picture: string;
    description?: string;
    uri?: string;
    spotifyLink?: string;
    tidalLink?: string;
    appleMusicLink?: string;
    curatedBy: {
      id: string;
      displayName: string;
      did: string;
      avatar: string;
      handle: string;
    };
    trackCount: number;
    tracks: {
      id: string;
      trackNumber: number;
      album: string;
      albumArt: string;
      albumArtist: string;
      title: string;
      artist: string;
      createdAt: string;
      uri: string;
      albumUri: string;
      artistUri: string;
      duration: number;
      discNumber: number;
    }[];
  } | null>(null);
  usePlaylistQuery(did!, rkey!);
  const { getPlaylist } = usePlaylists();
  const uri = `${did}/app.rocksky.playlist/${rkey}`;
  const profile = useAtomValue(profileAtom);
  const removeTrack = useRemoveTrackFromPlaylistMutation();
  const router = useRouter();
  const setAddSongsTarget = useSetAtom(addSongsTargetAtom);
  const openPlaylistModal = useSetAtom(createPlaylistModalOpenAtom);
  const [pending, setPending] = useAtom(pendingPlaylistTracksAtom);
  const [filter, setFilter] = useState("");
  const playlistUri = playlist?.curatedBy?.did
    ? `at://${playlist.curatedBy.did}/app.rocksky.playlist/${rkey}`
    : "";
  const tracks = useMemo(() => {
    const rows = playlist?.tracks ?? [];
    const have = new Set(rows.map((t) => t.uri));
    const extra = (pending[playlistUri] ?? []).filter((t) => !have.has(t.uri));
    return [...rows, ...extra];
  }, [playlist, pending, playlistUri]);

  const trackArts = useMemo(() => {
    const arts: string[] = [];
    for (const t of tracks) {
      if (t.albumArt && !arts.includes(t.albumArt)) arts.push(t.albumArt);
      if (arts.length === 4) break;
    }
    return arts;
  }, [tracks]);

  const totalDuration = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.duration || 0), 0),
    [tracks],
  );

  // `index` is assigned before filtering so a filtered row keeps its real
  // position in the playlist.
  const rows = useMemo(
    () =>
      tracks.map((x, index) => ({
        id: x.id,
        index,
        trackNumber: x.trackNumber,
        albumArt: x.albumArt,
        title: x.title,
        artist: x.artist,
        uri: x.uri,
        albumUri: x.albumUri,
        artistUri: x.artistUri,
        albumArtist: x.albumArtist,
        duration: x.duration,
        discNumber: x.discNumber,
      })),
    [tracks],
  );

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.artist, r.albumArtist].some((f) =>
        (f ?? "").toLowerCase().includes(q),
      ),
    );
  }, [rows, filter]);

  const isOwner = !!profile?.did && profile.did === playlist?.curatedBy?.did;

  const onRemoveTrack = async (songUri: string) => {
    if (!playlist?.curatedBy?.did || !rkey) return;
    await removeTrack.mutateAsync({
      uri: `at://${playlist.curatedBy.did}/app.rocksky.playlist/${rkey}`,
      songUri,
    });
    // The row only disappears from the AppView once jetstream ingests the
    // delete commit, so drop it locally rather than refetching into a stale list.
    setPlaylist((prev) =>
      prev
        ? { ...prev, tracks: prev.tracks.filter((t) => t.uri !== songUri) }
        : prev,
    );
    setPending((prev) => ({
      ...prev,
      [playlistUri]: (prev[playlistUri] ?? []).filter((t) => t.uri !== songUri),
    }));
  };

  const refetch = useCallback(async () => {
    if (!did || !rkey) return;
    setPlaylist(await getPlaylist(did, rkey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, rkey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Refetch when the add-songs modal closes. It races jetstream — the record
  // may not be ingested yet — so pendingTracks below covers the gap until a
  // later load returns the real rows.
  const modalOpen = useAtomValue(createPlaylistModalOpenAtom);
  const wasOpen = useRef(modalOpen);
  useEffect(() => {
    if (wasOpen.current && !modalOpen) void refetch();
    wasOpen.current = modalOpen;
  }, [modalOpen, refetch]);
  return (
    <Main>
      <div className="pb-[100px] pt-[50px]">
        <BackButton
          aria-label="Go back"
          title="Go back"
          onClick={() => router.history.back()}
        >
          <IconArrowLeft size={20} />
        </BackButton>
        {!playlist && (
          <ContentLoader
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
            viewBox="100 0 850 700"
            height={520}
            width={700}
          >
            <rect x="400" y="21" rx="10" ry="10" width="694" height="20" />
            <rect x="400" y="61" rx="10" ry="10" width="80" height="20" />
            <rect x="500" y="-46" rx="3" ry="3" width="350" height="6" />
            <rect x="471" y="-45" rx="3" ry="3" width="380" height="6" />
            <rect x="484" y="-45" rx="3" ry="3" width="201" height="6" />
            <rect x="10" y="21" rx="8" ry="8" width="360" height="300" />
          </ContentLoader>
        )}
        {playlist && (
          <>
            <Group>
              <div className="mr-[12px]">
                <PlaylistCover
                  picture={playlist.picture}
                  trackArts={trackArts}
                />
              </div>
              <div className="ml-[20px]">
                <HeadingMedium margin={0} className="!text-[var(--color-text)]">
                  {playlist.name}
                </HeadingMedium>
                <div className="mt-[10px]">
                  <LabelMedium className="!text-[var(--color-text-muted)]">
                    {tracks.length} Track
                    {tracks.length > 1 ? "s" : ""}
                    {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
                  </LabelMedium>
                </div>
                <div className="mt-[40px]">
                  <LabelMedium className="!text-[var(--color-text-muted)]">
                    {playlist.description}
                  </LabelMedium>
                </div>
              </div>
            </Group>

            <ActionRow className="mt-[20px]">
              <PillLink
                href={`https://pdsls.dev/at/${uri.replace("at://", "")}`}
                target="_blank"
              >
                <ExternalLink size={16} /> View on PDSls
              </PillLink>
              {isOwner && (
                <GhostButton
                  onClick={() => {
                    setAddSongsTarget({
                      uri: `at://${playlist.curatedBy.did}/app.rocksky.playlist/${rkey}`,
                      name: playlist.name,
                    });
                    openPlaylistModal(true);
                  }}
                >
                  <IconPlus size={16} /> Add songs
                </GhostButton>
              )}
            </ActionRow>

            <Group className="mb-[20px] items-center">
              <Avatar
                name={playlist.curatedBy.displayName}
                src={playlist.curatedBy.avatar}
                size="45px"
              />
              <div className="ml-[10px]">
                <LabelMedium className="!text-[var(--color-text-muted)] uppercase text-[12px]">
                  Curated By
                </LabelMedium>
                <LabelMedium className="!text-[var(--color-text)] text-[14px]">
                  <Link to={`/profile/${playlist.curatedBy.handle}`}>
                    {playlist.curatedBy.displayName}
                  </Link>
                </LabelMedium>
              </div>
              <div className="flex flex-1 justify-end">
                <PlaylistSearch onChange={setFilter} />
              </div>
            </Group>

            <TableBuilder
              data={visibleRows}
              emptyMessage={
                filter.trim()
                  ? `No tracks match "${filter.trim()}".`
                  : "This playlist is empty."
              }
              divider="clean"
              overrides={{
                TableHeadRow: {
                  style: {
                    display: "none",
                    backgroundColor: "var(--color-background) !important",
                  },
                },
                TableBodyCell: {
                  style: {
                    verticalAlign: "center",
                  },
                },
                TableBodyRow: {
                  style: {
                    backgroundColor: "var(--color-background)",
                    ":hover": {
                      backgroundColor: "var(--color-menu-hover)",
                    },
                  },
                },
                TableEmptyMessage: {
                  style: {
                    backgroundColor: "var(--color-background)",
                  },
                },
                Table: {
                  style: {
                    backgroundColor: "var(--color-background)",
                  },
                },
              }}
            >
              <TableBuilderColumn
                header="Track"
                overrides={{
                  TableBodyCell: {
                    style: {
                      width: "50px",
                      verticalAlign: "center",
                    },
                  },
                }}
              >
                {(row: Row) => (
                  <div className="flex flex-row items-center flex-1">
                    {row.index + 1}
                  </div>
                )}
              </TableBuilderColumn>
              <TableBuilderColumn
                header="Title"
                overrides={{
                  TableBodyCell: {
                    style: {
                      width: "100%",
                      maxWidth: 0,
                    },
                  },
                }}
              >
                {(row: Row) => (
                  <div className="flex flex-row items-center min-w-0">
                    <div className="min-w-0">
                      <div>
                        {row.uri && (
                          <Link
                            to={uriToPath(row.uri)}
                            className="!text-[var(--color-text)] block truncate"
                          >
                            {row.title}
                          </Link>
                        )}
                        {!row.uri && (
                          <div className="!text-[var(--color-text)] truncate">
                            {row.title}
                          </div>
                        )}
                      </div>
                      <div>
                        {row.artistUri && (
                          <Link
                            to={uriToPath(row.artistUri)}
                            className="!text-[var(--color-text-muted)] block truncate"
                          >
                            {row.albumArtist}
                          </Link>
                        )}
                        {!row.artistUri && (
                          <div className="!text-[var(--color-text-muted)] truncate">
                            {row.albumArtist}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TableBuilderColumn>
              <TableBuilderColumn header="Duration">
                {(row: Row) => (
                  <div style={{ fontFamily: "var(--font-mono)" }}>
                    {formatTime(row.duration)}
                  </div>
                )}
              </TableBuilderColumn>
              {isOwner && (
                <TableBuilderColumn
                  header=""
                  overrides={{
                    TableBodyCell: { style: { width: "48px" } },
                  }}
                >
                  {(row: Row) => (
                    <RowAction
                      aria-label={`Remove ${row.title} from this playlist`}
                      title="Remove from playlist"
                      disabled={removeTrack.isPending}
                      onClick={() => void onRemoveTrack(row.uri)}
                    >
                      <IconTrash size={16} />
                    </RowAction>
                  )}
                </TableBuilderColumn>
              )}
            </TableBuilder>
          </>
        )}
      </div>
    </Main>
  );
}

export default Playlist;
