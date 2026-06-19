import styled from "@emotion/styled";
import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconPlayerPlay,
  IconVinyl,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { Route } from "../../routes/library/artist/$id";
import { getCoverArtUrl, fetchNavidromeAlbum, type NavidromeAlbum, type NavidromeCredentials } from "../../api/navidrome";
import { useNavidromeArtistQuery, useNavidromeCredentials, songToQueueTrack } from "../../hooks/useNavidrome";
import { useUploadPlayer } from "../../hooks/useUploadPlayer";
import type { QueueTrack } from "../../atoms/queue";
import Main from "../../layouts/Main";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchAllArtistTracks(albums: NavidromeAlbum[], creds: NavidromeCredentials): Promise<QueueTrack[]> {
  const results = await Promise.all(
    albums.map(async (a) => {
      const full = await fetchNavidromeAlbum(creds, a.id);
      const artUrl = full?.coverArt ? getCoverArtUrl(creds, full.coverArt) : null;
      return (full?.song ?? []).map((s) => songToQueueTrack(s, creds, artUrl));
    }),
  );
  return results.flat();
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Page = styled.div`
  margin-top: 70px;
  margin-bottom: 150px;
`;

const BackBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 6px 8px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  border-radius: 10px;
  margin-bottom: 24px;
  &:hover { background: var(--color-menu-hover); color: var(--color-text); }
`;

const ArtistHeader = styled.div`
  display: flex;
  gap: 24px;
  align-items: flex-end;
  margin-bottom: 40px;
`;

const ArtistAvatar = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--color-menu-hover);
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  font-family: RockfordSansBold;
  color: var(--color-text-muted);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
`;

const ArtistMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const ArtistName = styled.h1`
  margin: 0 0 8px;
  font-size: 1.75rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const ArtistStats = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-text-muted);
`;

const PlayButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
`;

const PlayBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  border: none;
  background: var(--color-text);
  color: var(--color-background);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  border-radius: 999px;
  cursor: pointer;
  &:hover { opacity: 0.85; }
`;

const ShuffleBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 4px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  font-family: RockfordSansMedium;
  cursor: pointer;
  &:hover { color: var(--color-text); }
`;

const SectionTitle = styled.h2`
  margin: 0 0 16px;
  font-size: 1rem;
  font-family: RockfordSansBold;
  color: var(--color-text);
`;

const AlbumGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 40px;
`;

const AlbumCard = styled.div`
  cursor: pointer;
  &:hover .alb-art { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.14); }
`;

const AlbumArtWrap = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  background: var(--color-menu-hover);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
  margin-bottom: 8px;
`;

const AlbumName = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const AlbumSub = styled.p`
  margin: 2px 0 0;
  font-size: 0.725rem;
  color: var(--color-text-muted);
`;

const shimmer = `
  @keyframes shimmer {
    0% { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
`;

const SkeletonBox = styled.div<{ w?: string; h?: string; radius?: string }>`
  ${shimmer}
  width: ${({ w }) => w ?? "100%"};
  height: ${({ h }) => h ?? "16px"};
  border-radius: ${({ radius }) => radius ?? "8px"};
  background: linear-gradient(
    90deg,
    var(--color-menu-hover) 25%,
    color-mix(in srgb, var(--color-menu-hover) 60%, var(--color-text-muted) 10%) 50%,
    var(--color-menu-hover) 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.4s infinite linear;
  flex-shrink: 0;
`;

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ArtistPageSkeleton() {
  return (
    <Main>
      <Page>
        <SkeletonBox w="80px" h="32px" radius="10px" style={{ marginBottom: 24 }} />
        <ArtistHeader>
          <SkeletonBox w="120px" h="120px" radius="50%" />
          <ArtistMeta>
            <SkeletonBox w="200px" h="28px" radius="8px" style={{ marginBottom: 10 }} />
            <SkeletonBox w="120px" h="14px" radius="6px" style={{ marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 12 }}>
              <SkeletonBox w="90px" h="38px" radius="999px" />
              <SkeletonBox w="80px" h="38px" radius="999px" />
            </div>
          </ArtistMeta>
        </ArtistHeader>
        <SkeletonBox w="80px" h="18px" radius="6px" style={{ marginBottom: 16 }} />
        <AlbumGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <SkeletonBox w="100%" h="0" radius="10px" style={{ paddingBottom: "100%", marginBottom: 8 }} />
              <SkeletonBox w="80%" h="13px" radius="5px" style={{ marginBottom: 4 }} />
              <SkeletonBox w="50%" h="11px" radius="5px" />
            </div>
          ))}
        </AlbumGrid>
      </Page>
    </Main>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LibraryArtist() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { data: creds } = useNavidromeCredentials();
  const { playNow } = useUploadPlayer();

  const { data: artist, isLoading } = useNavidromeArtistQuery(id);
  const albums: NavidromeAlbum[] = artist?.album ?? [];

  const handlePlayAll = useCallback(async () => {
    if (!creds) return;
    playNow(await fetchAllArtistTracks(albums, creds));
  }, [albums, creds, playNow]);

  const handleShuffle = useCallback(async () => {
    if (!creds) return;
    const tracks = await fetchAllArtistTracks(albums, creds);
    playNow([...tracks].sort(() => Math.random() - 0.5));
  }, [albums, creds, playNow]);

  if (isLoading || !artist || !creds) return <ArtistPageSkeleton />;

  return (
    <Main>
      <Page>
        <BackBtn onClick={() => navigate({ to: "/library" })}>
          <IconArrowLeft size={16} /> Library
        </BackBtn>

        <ArtistHeader>
          <ArtistAvatar>
            {artist.artistImageUrl
              ? <img src={artist.artistImageUrl} alt={artist.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : artist.name.charAt(0).toUpperCase()}
          </ArtistAvatar>
          <ArtistMeta>
            <ArtistName>{artist.name}</ArtistName>
            <ArtistStats>{albums.length} album{albums.length !== 1 ? "s" : ""}</ArtistStats>
            <PlayButtons>
              <PlayBtn onClick={handlePlayAll}><IconPlayerPlay size={15} /> Play</PlayBtn>
              <ShuffleBtn onClick={handleShuffle}><IconArrowsShuffle size={15} /> Shuffle</ShuffleBtn>
            </PlayButtons>
          </ArtistMeta>
        </ArtistHeader>

        {albums.length > 0 && (
          <>
            <SectionTitle>Albums</SectionTitle>
            <AlbumGrid>
              {albums.map((alb) => {
                const artUrl = alb._coverArtUrl ?? (alb.coverArt ? getCoverArtUrl(creds, alb.coverArt) : null);
                return (
                  <AlbumCard key={alb.id} onClick={() => navigate({ to: "/library/album/$id", params: { id: alb.id } })}>
                    <AlbumArtWrap className="alb-art">
                      {artUrl
                        ? <img src={artUrl} alt={alb.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <IconVinyl size={36} color="var(--color-text-muted)" />}
                    </AlbumArtWrap>
                    <AlbumName title={alb.name}>{alb.name}</AlbumName>
                    <AlbumSub>{alb.year ?? `${alb.songCount} tracks`}</AlbumSub>
                  </AlbumCard>
                );
              })}
            </AlbumGrid>
          </>
        )}
      </Page>
    </Main>
  );
}
