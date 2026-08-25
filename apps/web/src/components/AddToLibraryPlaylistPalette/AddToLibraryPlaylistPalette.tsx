import styled from "@emotion/styled";
import { Search as SearchIcon } from "@styled-icons/evaicons-solid";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCoverArtUrl } from "../../api/navidrome";
import { addToLibraryPlaylistSongAtom } from "../../atoms/addToLibraryPlaylist";
import {
  addLibrarySongsTargetAtom,
  editingLibraryPlaylistAtom,
  libraryPlaylistModalOpenAtom,
  newLibraryPlaylistSeedSongsAtom,
} from "../../atoms/libraryPlaylist";
import {
  useAddTrackToPlaylistMutation,
  useNavidromeCredentials,
  useNavidromePlaylistsQuery,
} from "../../hooks/useNavidrome";
import {
  AddError,
  Empty,
  EscHint,
  FootHint,
  Footer,
  Overlay,
  Panel,
  Primary,
  QueryInput,
  Results,
  Row,
  RowText,
  SearchRow,
  Secondary,
  Thumb,
} from "../CreatePlaylistModal/styles";
import TrackArtMosaic from "../TrackArtMosaic";

const PinnedRow = styled(Row)`
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
  border-radius: 9px 9px 0 0;
`;

const PinnedIcon = styled.div`
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(128, 128, 128, 0.4);
  color: var(--color-primary);
`;

const Pinned = styled.div`
  flex-shrink: 0;
  padding: 6px 6px 0;
`;

const CreateLabel = styled.div`
  color: var(--color-primary);
  font-family: RockfordSansMedium;
  font-size: 15px;
`;

const ContextLabel = styled.div`
  flex-shrink: 0;
  font-family: RockfordSansBold;
  font-size: 11px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 12px 18px 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

function AddToLibraryPlaylistPalette() {
  const [song, setSong] = useAtom(addToLibraryPlaylistSongAtom);
  const { data: creds } = useNavidromeCredentials();
  const { data: playlists = [] } = useNavidromePlaylistsQuery();
  const addTrack = useAddTrackToPlaylistMutation();
  const setModalOpen = useSetAtom(libraryPlaylistModalOpenAtom);
  const setEditing = useSetAtom(editingLibraryPlaylistAtom);
  const setAddSongsTarget = useSetAtom(addLibrarySongsTargetAtom);
  const setSeedSongs = useSetAtom(newLibraryPlaylistSeedSongsAtom);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) =>
      [p.name, p.comment].some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [playlists, query]);

  // Index 0 is always "Create a new Playlist".
  const count = matches.length + 1;

  useEffect(() => {
    if (song) {
      setQuery("");
      setActive(0);
      setAdded(new Set());
      setError(null);
      inputRef.current?.focus();
    }
  }, [song]);

  useEffect(() => {
    if (!song) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [song]);

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!song) return null;

  const close = () => setSong(null);

  const startCreate = () => {
    setEditing(null);
    setAddSongsTarget(null);
    setSeedSongs([song.id]);
    setSong(null);
    setModalOpen(true);
  };

  const addTo = async (playlistId: string) => {
    if (added.has(playlistId) || pending) return;
    setPending(playlistId);
    setError(null);
    try {
      await addTrack.mutateAsync({ playlistId, songId: song.id });
      setAdded((prev) => new Set(prev).add(playlistId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not add to that playlist.",
      );
    } finally {
      setPending(null);
    }
  };

  const choose = (index: number) => {
    if (index === 0) return startCreate();
    const playlist = matches[index - 1];
    if (playlist) void addTo(playlist.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % count);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  return (
    <Overlay onClick={close}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <SearchRow>
          <SearchIcon size={22} color="var(--color-text-muted)" />
          <QueryInput
            ref={inputRef}
            value={query}
            placeholder="Search your playlists…"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <EscHint>esc</EscHint>
        </SearchRow>

        <ContextLabel>Add “{song.title}” to</ContextLabel>

        {error && <AddError>{error}</AddError>}

        <Pinned>
          <PinnedRow
            active={active === 0}
            ref={(el) => {
              rowRefs.current[0] = el;
            }}
            onMouseMove={() => setActive(0)}
            onClick={startCreate}
            style={{ cursor: "pointer" }}
          >
            <PinnedIcon>
              <IconPlus size={20} />
            </PinnedIcon>
            <RowText>
              <CreateLabel>Create a new Playlist</CreateLabel>
              <Secondary>Starts with “{song.title}”</Secondary>
            </RowText>
          </PinnedRow>
        </Pinned>

        {matches.length > 0 && (
          <Results>
            {matches.map((playlist, idx) => (
              <Row
                key={playlist.id}
                active={active === idx + 1}
                ref={(el) => {
                  rowRefs.current[idx + 1] = el;
                }}
                onMouseMove={() => setActive(idx + 1)}
                onClick={() => choose(idx + 1)}
                style={{ cursor: "pointer" }}
              >
                <Thumb>
                  {creds && playlist.coverArt ? (
                    <img src={getCoverArtUrl(creds, playlist.coverArt)} alt="" />
                  ) : (
                    <TrackArtMosaic
                      trackArts={playlist.trackArts}
                      fallbackSize={20}
                    />
                  )}
                </Thumb>
                <RowText>
                  <Primary>{playlist.name}</Primary>
                  <Secondary>
                    {playlist.songCount} track
                    {playlist.songCount === 1 ? "" : "s"}
                  </Secondary>
                </RowText>
                {added.has(playlist.id) && <IconCheck size={16} />}
                {pending === playlist.id && <Secondary>Adding…</Secondary>}
              </Row>
            ))}
          </Results>
        )}

        {matches.length === 0 && (
          <Empty>
            {query.trim()
              ? `No playlists match “${query.trim()}”.`
              : "You don't have any playlists yet."}
          </Empty>
        )}

        <Footer hints>
          <FootHint>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </FootHint>
          <FootHint>
            <kbd>↵</kbd> add
          </FootHint>
          <FootHint>
            <kbd>esc</kbd> close
          </FootHint>
        </Footer>
      </Panel>
    </Overlay>
  );
}

export default AddToLibraryPlaylistPalette;
