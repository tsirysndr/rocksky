import { useAtom } from "jotai";
import { libraryAlbumSelectionAtom } from "../../atoms/librarySource";
import styled from "@emotion/styled";
import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconDots,
  IconFolder,
  IconMusic,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlaylistAdd,
  IconRefresh,
  IconSearch,
  IconUser,
  IconVinyl,
  IconX,
} from "@tabler/icons-react";
import { songHash } from "@rocksky/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tab, Tabs } from "baseui/tabs-motion";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useArtistPictures } from "../../api/artistPictures";
import {
  type LocalAlbum,
  type LocalArtist,
  type LocalTrack,
  artUrl,
  localLibrary,
} from "../../api/localLibrary";
import type { QueueTrack } from "../../atoms/queue";
import { DropdownPortal } from "../../components/DropdownPortal";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import Main from "../../layouts/Main";
import ScrollToTop from "../../components/ScrollToTop";
import { shuffled } from "../../lib/shuffle";
import {
  AlbumArtContainer,
  AlbumArtWrap,
  AlbumArtistName,
  AlbumCard,
  AlbumName,
  ArtistAvatar,
  ArtistCard,
  ArtistGrid,
  ArtistNameLabel,
  ArtworkBox,
  ArtworkOverlay,
  Duration,
  EmptyState,
  EmptySubtitle,
  EmptyTitle,
  Grid,
  MenuBtn,
  MenuItem,
  MenuWrap,
  PlayBtn,
  PlayButtons,
  PrimaryButton,
  ShuffleBtn,
  TrackInfo,
  TrackList,
  TrackMeta,
  TrackNum,
  TrackRow,
  TrackTitle,
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
`;

const FolderBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const FolderPath = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
`;

const SmallBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 10px;
  background: var(--color-menu-hover);
  color: var(--color-text);
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--color-primary) 15%, transparent); }
  &:disabled { opacity: 0.5; cursor: default; }
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

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
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

const DetailTitle = styled.h2`
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.125rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Count = styled.span`
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const Note = styled.p`
  margin: 24px 0;
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-text-muted);
`;

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function toQueueTrack(t: LocalTrack): QueueTrack {
  return {
    uploadId: `local:${t.id}`,
    audioUrl: t.path,
    streamUrl: t.path,
    title: t.title,
    artist: t.artist,
    albumArtist: t.albumArtist || t.artist,
    album: t.album,
    albumArt: artUrl(t.art),
    duration: t.durationMs,
    sha256: songHash(t.title, t.artist, t.album),
    songUri: "",
    trackNumber: t.trackNumber,
    genre: t.genre,
    year: t.year,
  };
}

type Detail = { kind: "album"; album: LocalAlbum } | { kind: "artist"; artist: LocalArtist };

export default function LocalLibrary({ sourceSwitcher }: { sourceSwitcher: ReactNode }) {
  const cache = useQueryClient();
  const { playNow, playNext, playLast } = useUploadPlayer();
  const [tab, setTab] = useState("0");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [menu, setMenu] = useState<{ track: LocalTrack; anchor: HTMLElement } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useAtom(libraryAlbumSelectionAtom);
  useEffect(() => {
    if (selection?.source !== "local") return;
    setDetail({ kind: "album", album: selection.album });
    setSearch("");
    setQuery("");
    setSelection(null);
  }, [selection, setSelection]);

  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
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

  const status = useQuery({
    queryKey: ["local-library", "status"],
    queryFn: localLibrary.status,
    refetchInterval: (q) => (q.state.data?.scan.state === "scanning" ? 1000 : false),
  });
  const scanning = status.data?.scan.state === "scanning";
  const scannedTracks = status.data?.tracks ?? 0;
  useEffect(() => {
    if (!scanning && status.data) void cache.invalidateQueries({ queryKey: ["local-library", "data"] });
  }, [scanning, scannedTracks, status.data, cache]);

  const scope = detail?.kind === "album" ? { albumId: detail.album.id } : detail?.kind === "artist" ? { artistId: detail.artist.id } : {};
  const tracks = useQuery({
    queryKey: ["local-library", "data", "tracks", query, scope],
    queryFn: () => localLibrary.tracks({ query, ...scope, limit: 1000 }),
    enabled: tab === "0" || detail !== null,
  });
  const albums = useQuery({
    queryKey: ["local-library", "data", "albums", query, detail?.kind === "artist" ? detail.artist.id : ""],
    queryFn: () => localLibrary.albums(query, detail?.kind === "artist" ? detail.artist.id : undefined),
    enabled: tab === "1" || detail?.kind === "artist",
  });
  const artists = useQuery({
    queryKey: ["local-library", "data", "artists", query],
    queryFn: () => localLibrary.artists(query),
    enabled: tab === "2" && !detail,
  });
  const artistNames = useMemo(
    () => (artists.data?.artists ?? []).filter((a) => !a.art).map((a) => a.name),
    [artists.data],
  );
  const pictures = useArtistPictures(artistNames);

  const list = tracks.data?.tracks ?? [];
  const run = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not play track");
    }
  };
  const playFrom = (index: number) => void run(() => playNow(list.map(toQueueTrack), index));
  const rescan = () => void run(async () => {
    await localLibrary.scan(true);
    await status.refetch();
  });
  const pickFolder = () => void run(async () => {
    const r = await localLibrary.pickFolder();
    if ("cancelled" in r) return;
    setDetail(null);
    await status.refetch();
  });

  const trackRows = (
    <>
      {list.length > 0 && (
        <PlayButtons>
          <PlayBtn onClick={() => playFrom(0)}>
            <IconPlayerPlay size={15} /> Play
          </PlayBtn>
          <ShuffleBtn onClick={() => void run(() => playNow(shuffled(list.map(toQueueTrack))))}>
            <IconArrowsShuffle size={15} /> Shuffle
          </ShuffleBtn>
          <Count>{list.length} tracks</Count>
        </PlayButtons>
      )}
      {tracks.isPending ? (
        <Note>Loading…</Note>
      ) : list.length === 0 ? (
        <EmptyState>
          <IconMusic size={48} color="var(--color-text-muted)" />
          <div style={{ textAlign: "center" }}>
            <EmptyTitle>{scanning ? "Scanning your music…" : "No music found"}</EmptyTitle>
            <EmptySubtitle>
              {query ? "Nothing matches your search" : `Nothing playable in ${status.data?.folder ?? "your music folder"}`}
            </EmptySubtitle>
          </div>
          {!query && !scanning && (
            <PrimaryButton onClick={pickFolder}>
              <IconFolder size={15} /> Choose a folder
            </PrimaryButton>
          )}
        </EmptyState>
      ) : (
        <TrackList>
          {list.map((t, idx) => {
            const art = artUrl(t.art);
            return (
              <TrackRow key={t.id} onClick={() => playFrom(idx)}>
                <TrackNum>{detail?.kind === "album" && t.trackNumber ? t.trackNumber : idx + 1}</TrackNum>
                <ArtworkBox>
                  {art ? (
                    <>
                      <img src={art} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <ArtworkOverlay className="artwork-overlay">
                        <IconPlayerPlay size={16} color="#fff" fill="#fff" />
                      </ArtworkOverlay>
                    </>
                  ) : (
                    <IconMusic size={18} color="var(--color-text-muted)" />
                  )}
                </ArtworkBox>
                <TrackInfo>
                  <TrackTitle>{t.title}</TrackTitle>
                  <TrackMeta>{t.artist}{t.album && ` — ${t.album}`}</TrackMeta>
                </TrackInfo>
                <Duration>{formatDuration(t.durationMs)}</Duration>
                <div className="track-actions" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <MenuWrap>
                    <MenuBtn
                      aria-label={`Options for ${t.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu({ track: t, anchor: e.currentTarget });
                      }}
                    >
                      <IconDots size={15} />
                    </MenuBtn>
                  </MenuWrap>
                </div>
              </TrackRow>
            );
          })}
        </TrackList>
      )}
    </>
  );

  const albumGrid = (items: LocalAlbum[]) =>
    items.length === 0 ? (
      <EmptyState>
        <IconVinyl size={48} color="var(--color-text-muted)" />
        <div style={{ textAlign: "center" }}>
          <EmptyTitle>No albums yet</EmptyTitle>
          <EmptySubtitle>Tagged music files show up here as albums</EmptySubtitle>
        </div>
      </EmptyState>
    ) : (
      <Grid>
        {items.map((alb) => {
          const art = artUrl(alb.art);
          return (
            <AlbumCard key={alb.id} onClick={() => setDetail({ kind: "album", album: alb })}>
              <AlbumArtContainer>
                <AlbumArtWrap className="album-art-wrap">
                  {art ? (
                    <img src={art} alt={alb.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <IconVinyl size={40} color="var(--color-text-muted)" />
                  )}
                </AlbumArtWrap>
              </AlbumArtContainer>
              <AlbumName title={alb.title}>{alb.title}</AlbumName>
              <AlbumArtistName title={alb.artist}>{alb.artist}</AlbumArtistName>
            </AlbumCard>
          );
        })}
      </Grid>
    );

  const artistGrid = (
    <ArtistGrid>
      {(artists.data?.artists ?? []).map((a) => {
        const art = artUrl(a.art) ?? pictures[a.name];
        return (
          <ArtistCard key={a.id} onClick={() => setDetail({ kind: "artist", artist: a })}>
            <ArtistAvatar className="artist-avatar">
              {art ? (
                <img src={art} alt={a.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <IconUser size={36} />
              )}
            </ArtistAvatar>
            <ArtistNameLabel title={a.name}>{a.name}</ArtistNameLabel>
          </ArtistCard>
        );
      })}
    </ArtistGrid>
  );

  return (
    <Main>
      <Page>
        <Header>
          <Title>Local music</Title>
          {sourceSwitcher}
        </Header>

        <FolderBar>
          <IconFolder size={15} />
          <FolderPath title={status.data?.folder}>{status.data?.folder ?? "…"}</FolderPath>
          {scanning && <span>Scanning… {status.data?.scan.count ?? 0} files</span>}
          <SmallBtn onClick={pickFolder}>Change folder</SmallBtn>
          <SmallBtn onClick={rescan} disabled={scanning}>
            <IconRefresh size={14} /> Rescan
          </SmallBtn>
        </FolderBar>
        {status.data?.scan.error && <Note role="alert">{status.data.scan.error}</Note>}
        {error && <Note role="alert" style={{ color: "var(--color-primary)" }}>{error}</Note>}

        <SearchWrap>
          <SearchIconWrap><IconSearch size={15} /></SearchIconWrap>
          <SearchInput
            type="text"
            placeholder="Search local music…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <ClearBtn onClick={() => setSearch("")}><IconX size={14} /></ClearBtn>}
        </SearchWrap>

        {detail ? (
          <>
            <DetailHeader>
              <Back aria-label="Back" onClick={() => setDetail(null)}><IconArrowLeft size={18} /></Back>
              <DetailTitle>{detail.kind === "album" ? detail.album.title : detail.artist.name}</DetailTitle>
            </DetailHeader>
            {detail.kind === "artist" && (albums.data?.albums.length ?? 0) > 0 && (
              <div style={{ marginBottom: 24 }}>{albumGrid(albums.data?.albums ?? [])}</div>
            )}
            {trackRows}
          </>
        ) : (
          <Tabs
            activeKey={tab}
            onChange={({ activeKey }) => setTab(String(activeKey))}
            overrides={tabsOverrides}
            activateOnFocus
          >
            <Tab title="Tracks" overrides={tabOverrides}>{trackRows}</Tab>
            <Tab title="Albums" overrides={tabOverrides}>
              {albums.isPending ? <Note>Loading…</Note> : albumGrid(albums.data?.albums ?? [])}
            </Tab>
            <Tab title="Artists" overrides={tabOverrides}>
              {artists.isPending ? (
                <Note>Loading…</Note>
              ) : (artists.data?.artists.length ?? 0) === 0 ? (
                <EmptyState>
                  <IconUser size={48} color="var(--color-text-muted)" />
                  <div style={{ textAlign: "center" }}>
                    <EmptyTitle>No artists yet</EmptyTitle>
                    <EmptySubtitle>Tagged music files show up here by artist</EmptySubtitle>
                  </div>
                </EmptyState>
              ) : (
                artistGrid
              )}
            </Tab>
          </Tabs>
        )}

        {menu && (
          <DropdownPortal anchorEl={menu.anchor} menuRef={menuRef}>
            <MenuItem
              onClick={() => {
                const { track } = menu;
                setMenu(null);
                void run(() => playNow([toQueueTrack(track)], 0));
              }}
            >
              <IconPlayerPlay size={14} style={{ marginRight: 8, verticalAlign: -2 }} /> Play now
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { track } = menu;
                setMenu(null);
                void run(() => playNext(toQueueTrack(track)));
              }}
            >
              <IconPlayerSkipForward size={14} style={{ marginRight: 8, verticalAlign: -2 }} /> Play next
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { track } = menu;
                setMenu(null);
                void run(() => playLast(toQueueTrack(track)));
              }}
            >
              <IconPlaylistAdd size={14} style={{ marginRight: 8, verticalAlign: -2 }} /> Add to queue
            </MenuItem>
          </DropdownPortal>
        )}
        <ScrollToTop />
      </Page>
    </Main>
  );
}
