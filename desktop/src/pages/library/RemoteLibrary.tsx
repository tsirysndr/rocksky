import styled from "@emotion/styled";
import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconChevronRight,
  IconDisc,
  IconDotsVertical,
  IconFolder,
  IconMusic,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlaylistAdd,
  IconRadio,
  IconSearch,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { songHash } from "@rocksky/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Tab, Tabs } from "baseui/tabs-motion";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type LibraryEntry,
  type LibrarySource,
  plyrDisplayLabel,
  plyrTabs,
  remoteLibraries,
} from "../../api/remoteLibraries";
import type { QueueTrack } from "../../atoms/queue";
import { DropdownPortal } from "../../components/DropdownPortal";
import { useArtistPictures } from "../../api/artistPictures";
import { useInfiniteScrollSentinel } from "../../hooks/useInfiniteScrollSentinel";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import Main from "../../layouts/Main";
import { shuffled } from "../../lib/shuffle";
import {
  AlbumActionsOverlay,
  AlbumArtContainer,
  AlbumArtWrap,
  AlbumArtistName,
  AlbumCard,
  AlbumFloatBtn,
  AlbumName,
  ArtistAvatar,
  ArtistCard,
  ArtistGrid,
  ArtistNameLabel,
  Grid,
  MenuWrap,
  PlayBtn,
  PlayButtons,
  ShuffleBtn,
  tabOverrides,
  tabsOverrides,
} from "./libraryStyles";

const Page = styled.div`
  margin-top: 70px;
  margin-bottom: 150px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SearchWrap = styled.div`
  position: relative;
  margin-bottom: 16px;
`;

const SearchIconWrap = styled.span`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  display: flex;
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 9px 36px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  outline: none;
  &::placeholder { color: var(--color-text-muted); }
  &:focus { border-color: var(--color-primary); }
`;

const ClearBtn = styled.button`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  cursor: pointer;
  border-radius: 6px;
  &:hover { color: var(--color-text); }
`;



const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 16px;
`;

const Count = styled.span`
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const Heading = styled.h2`
  flex: 1;
  margin: 0;
  font-size: 1.125rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Back = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: var(--color-menu-hover);
  color: var(--color-text);
  cursor: pointer;
`;




const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 10px;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
`;

const Art = styled.div<{ round?: boolean }>`
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: ${(p) => (p.round ? "23px" : "7px")};
  overflow: hidden;
  background: var(--color-menu-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
`;

const Info = styled.div`
  flex: 1;
  min-width: 0;
  p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const RowTitle = styled.p`
  font-size: 0.9375rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
`;

const RowMeta = styled.p`
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const MenuBtn = styled.button`
  display: flex;
  padding: 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  &:hover { color: var(--color-text); background: color-mix(in srgb, var(--color-text-muted) 15%, transparent); }
`;

const MenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  text-align: left;
  cursor: pointer;
  &:hover { background: var(--color-menu-hover); }
`;

const Note = styled.p`
  margin: 24px 0;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-text-muted);
`;

const LoadMore = styled.button`
  display: block;
  margin: 16px auto;
  padding: 8px 16px;
  border: none;
  border-radius: 12px;
  background: var(--color-menu-hover);
  color: var(--color-primary);
  font-family: RockfordSansMedium;
  cursor: pointer;
`;

const Sentinel = styled.div`height: 1px;`;

function EntryArtwork({ item }: { item: LibraryEntry }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.art]);
  const round = item.kind === "artist";
  const Icon =
    item.kind === "artist"
      ? IconUser
      : item.kind === "album"
        ? IconDisc
        : item.kind === "station"
          ? IconRadio
          : item.kind === "track"
            ? IconMusic
            : IconFolder;
  return (
    <Art round={round}>
      {item.art && !failed ? (
        <img src={item.art} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon size={20} />
      )}
    </Art>
  );
}

async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function toQueueTracks(source: LibrarySource, items: LibraryEntry[]) {
  return mapConcurrent(
    items,
    async (item): Promise<QueueTrack> => {
      const url = await remoteLibraries.stream(source.id, item.id);
      const artist =
        source.kind === "plyr" ? plyrDisplayLabel(item.artist, item.artistHandle) : item.artist;
      return {
        uploadId: `server:${source.id}:${item.id}`,
        audioUrl: url,
        streamUrl: url,
        title: item.title,
        artist,
        albumArtist: artist,
        album: item.album,
        albumArt: item.art,
        duration: item.durationMs,
        sha256: songHash(item.title, artist, item.album),
        songUri: "",
      };
    },
    6,
  );
}

const upnpAliases: Record<string, string> = {
  tracks: "Tracks",
  songs: "Tracks",
  "all tracks": "Tracks",
  "all songs": "Tracks",
  albums: "Albums",
  artists: "Artists",
  "album artists": "Artists",
  playlists: "Playlists",
  favorites: "Favorites",
  favourites: "Favorites",
};

export default function RemoteLibrary({
  source,
  sourceSwitcher,
}: {
  source: LibrarySource;
  sourceSwitcher: ReactNode;
}) {
  const { playNow, playNext, playLast } = useUploadPlayer();
  const [path, setPath] = useState<{ id: string; title: string }[]>([]);
  const [tab, setTab] = useState("Tracks");
  const [upnpCategories, setUpnpCategories] = useState<{ label: string; id: string }[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{ item: LibraryEntry; anchor: HTMLElement } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const folder = path.at(-1);

  const categories =
    source.kind === "plyr"
      ? plyrTabs.map((label) => ({ label, id: label.toLowerCase() }))
      : source.kind === "upnp"
        ? upnpCategories.length
          ? upnpCategories
          : [{ label: "Folders", id: "" }]
        : ["Tracks", "Albums", "Artists", "Playlists", "Favorites"].map((label) => ({
            label,
            id: label.toLowerCase(),
          }));
  const category = categories.find((c) => c.label === tab) ?? categories[0];
  const browseId = folder?.id ?? category?.id ?? "";
  const localFilter = source.kind === "upnp";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const queryKey = ["remote-library", source.id, browseId, localFilter ? "" : debounced];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      remoteLibraries.browse(source.id, browseId, localFilter ? "" : debounced, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page, _pages, previous) =>
      page.nextOffset != null && page.nextOffset > previous ? page.nextOffset : undefined,
    retry: 1,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
  });
  const sentinelRef = useInfiniteScrollSentinel(
    !!query.hasNextPage,
    query.isFetchingNextPage,
    query.fetchNextPage,
  );

  const items = useMemo(
    () => [
      ...new Map(
        query.data?.pages
          .flatMap((p) => p.entries)
          .map((item) => [`${item.kind}:${item.id}`, item]) ?? [],
      ).values(),
    ],
    [query.data],
  );

  useEffect(() => {
    if (source.kind !== "upnp" || upnpCategories.length || !items.length) return;
    const found = items
      .filter((item) => item.kind === "folder")
      .flatMap((item) => {
        const label = upnpAliases[item.title.trim().toLowerCase()];
        return label ? [{ label, id: item.id }] : [];
      });
    if (found.length < 2) return;
    const order = ["Tracks", "Albums", "Artists", "Playlists", "Favorites"];
    const unique = [...new Map(found.map((c) => [c.label, c])).values()].sort(
      (a, b) => order.indexOf(a.label) - order.indexOf(b.label),
    );
    setUpnpCategories([...unique, { label: "Folders", id: "" }]);
    setTab(unique[0].label);
    setPath([]);
    setSearch("");
    setDebounced("");
  }, [source.kind, upnpCategories.length, items]);

  const artistNames = useMemo(
    () => items.filter((i) => i.kind === "artist" && !i.art).map((i) => i.title),
    [items],
  );
  const pictures = useArtistPictures(artistNames);
  const visible =
    localFilter && search.trim()
      ? items.filter((item) =>
          `${item.title} ${item.artist} ${item.album}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
      : items;
  const tracks = visible.filter((item) => item.kind === "track");

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not play track");
    } finally {
      setBusy(false);
    }
  };
  const play = (item: LibraryEntry) =>
    void run(async () => playNow(await toQueueTracks(source, [item]), 0));
  const playFolder = (item: LibraryEntry) =>
    void run(async () => {
      const page = await remoteLibraries.browse(source.id, item.id, "", 0);
      const list = page.entries.filter((e) => e.kind === "track");
      if (list.length) await playNow(await toQueueTracks(source, list));
    });
  const playAll = (list: LibraryEntry[], from?: number) =>
    void run(async () => playNow(await toQueueTracks(source, list), from));

  const titleLabel = (item: LibraryEntry) =>
    source.kind === "plyr" && item.kind === "artist"
      ? plyrDisplayLabel(item.title, item.artistHandle)
      : item.title;
  const artistLabel = (item: LibraryEntry) =>
    source.kind === "plyr" ? plyrDisplayLabel(item.artist, item.artistHandle) : item.artist;

  const open = (item: LibraryEntry) => {
    if (item.kind === "track") {
      const index = tracks.indexOf(item);
      if (index >= 0 && tracks.length > 1) playAll(tracks, index);
      else play(item);
      return;
    }
    setPath((p) => [...p, { id: item.id, title: titleLabel(item) }]);
    setSearch("");
    setDebounced("");
  };

  const goBack = () => {
    setPath((p) => p.slice(0, -1));
    setSearch("");
    setDebounced("");
  };

  const content = (
    <>
        {folder && (
          <Toolbar>
            <Back aria-label="Back" onClick={goBack}><IconArrowLeft size={18} /></Back>
            <Heading>{folder.title}</Heading>
          </Toolbar>
        )}
        {tracks.length > 0 && (
          <Toolbar>
            <PlayButtons style={{ marginBottom: 0 }}>
              <PlayBtn disabled={busy} onClick={() => playAll(tracks)}>
                <IconPlayerPlay size={15} /> Play
              </PlayBtn>
              <ShuffleBtn disabled={busy} onClick={() => playAll(shuffled(tracks))}>
                <IconArrowsShuffle size={15} /> Shuffle
              </ShuffleBtn>
            </PlayButtons>
            <Count>
              {tracks.length} tracks{query.hasNextPage ? " loaded" : ""}
            </Count>
          </Toolbar>
        )}
        {source.kind === "plyr" && folder?.id.startsWith("station:") && (
          <RowMeta style={{ marginBottom: 12 }}>Station rotation</RowMeta>
        )}
        {error && <Note role="alert" style={{ color: "var(--color-primary)" }}>{error}</Note>}

        {query.isPending ? (
          <Note>Loading…</Note>
        ) : query.isError ? (
          <Note>
            {query.error.message}{" "}
            <LoadMore onClick={() => void query.refetch()}>Retry</LoadMore>
          </Note>
        ) : visible.length === 0 ? (
          <Note>
            {query.hasNextPage
              ? "No matches in loaded items yet. Load more to continue."
              : "No music found here."}
          </Note>
        ) : (
          visible.every((item) => item.kind === "album") ? (
          <Grid>
            {visible.map((item) => (
              <AlbumCard key={`${item.kind}:${item.id}`} onClick={() => open(item)}>
                <AlbumArtContainer>
                  <AlbumArtWrap className="album-art-wrap">
                    {item.art ? (
                      <img src={item.art} alt={item.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <IconDisc size={40} color="var(--color-text-muted)" />
                    )}
                  </AlbumArtWrap>
                  <AlbumActionsOverlay className="album-actions">
                    <MenuWrap>
                      <AlbumFloatBtn
                        aria-label={`Play ${item.title}`}
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          playFolder(item);
                        }}
                      >
                        <IconPlayerPlay size={16} fill="#fff" />
                      </AlbumFloatBtn>
                    </MenuWrap>
                  </AlbumActionsOverlay>
                </AlbumArtContainer>
                <AlbumName title={item.title}>{titleLabel(item)}</AlbumName>
                <AlbumArtistName title={item.artist}>{artistLabel(item)}</AlbumArtistName>
              </AlbumCard>
            ))}
          </Grid>
          ) : visible.every((item) => item.kind === "artist") ? (
          <ArtistGrid>
            {visible.map((item) => {
              const art = item.art ?? pictures[item.title] ?? null;
              return (
                <ArtistCard key={`${item.kind}:${item.id}`} onClick={() => open(item)}>
                  <ArtistAvatar className="artist-avatar">
                    {art ? (
                      <img src={art} alt={item.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <IconUser size={36} />
                    )}
                  </ArtistAvatar>
                  <ArtistNameLabel title={item.title}>{titleLabel(item)}</ArtistNameLabel>
                </ArtistCard>
              );
            })}
          </ArtistGrid>
          ) : (
          <List>
            {visible.map((item) => (
              <Row key={`${item.kind}:${item.id}`} onClick={() => open(item)}>
                <EntryArtwork
                  item={item.kind === "artist" && !item.art && pictures[item.title] ? { ...item, art: pictures[item.title] } : item}
                />
                <Info>
                  <RowTitle>{titleLabel(item)}</RowTitle>
                  <RowMeta>
                    {artistLabel(item) ||
                      (item.kind === "track" ? item.album : "Browse collection")}
                  </RowMeta>
                </Info>
                {item.kind === "track" ? (
                  <MenuBtn
                    aria-label={`Options for ${item.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu({ item, anchor: e.currentTarget });
                    }}
                  >
                    <IconDotsVertical size={16} />
                  </MenuBtn>
                ) : (
                  <IconChevronRight size={18} color="var(--color-text-muted)" />
                )}
              </Row>
            ))}
          </List>
          )
        )}

        {query.hasNextPage && (
          <>
            <Sentinel ref={sentinelRef} />
            <LoadMore
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage
                ? "Loading…"
                : query.isFetchNextPageError
                  ? "Could not load more. Retry"
                  : "Load more"}
            </LoadMore>
          </>
        )}

    </>
  );

  return (
    <Main>
      <Page>
        <Header>
          <Title>{source.name}</Title>
          {sourceSwitcher}
        </Header>

        <SearchWrap>
          <SearchIconWrap><IconSearch size={15} /></SearchIconWrap>
          <SearchInput
            type="text"
            placeholder={localFilter ? "Filter loaded items…" : "Search music…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <ClearBtn onClick={() => setSearch("")}><IconX size={14} /></ClearBtn>
          )}
        </SearchWrap>

        {categories.length > 1 ? (
          <Tabs
            activeKey={category?.label ?? ""}
            onChange={({ activeKey }) => {
              setTab(String(activeKey));
              setPath([]);
              setSearch("");
              setDebounced("");
            }}
            overrides={tabsOverrides}
            activateOnFocus
          >
            {categories.map((c) => (
              <Tab key={c.label} title={c.label} overrides={tabOverrides}>
                {content}
              </Tab>
            ))}
          </Tabs>
        ) : (
          content
        )}

        {menu && (
          <DropdownPortal anchorEl={menu.anchor} menuRef={menuRef}>
            <MenuItem
              onClick={() => {
                const { item } = menu;
                setMenu(null);
                play(item);
              }}
            >
              <IconPlayerPlay size={16} /> Play now
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { item } = menu;
                setMenu(null);
                void run(async () => playNext((await toQueueTracks(source, [item]))[0]));
              }}
            >
              <IconPlayerSkipForward size={16} /> Play next
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { item } = menu;
                setMenu(null);
                void run(async () => playLast((await toQueueTracks(source, [item]))[0]));
              }}
            >
              <IconPlaylistAdd size={16} /> Add to queue
            </MenuItem>
          </DropdownPortal>
        )}
      </Page>
    </Main>
  );
}

