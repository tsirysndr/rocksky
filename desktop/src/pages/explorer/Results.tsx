import styled from "@emotion/styled";
import type {
  AlbumViewBasic,
  ArtistViewBasic,
  PlaylistViewBasic,
  ScrobbleViewBasic,
  SongViewBasic,
} from "@rocksky/sdk";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import numeral from "numeral";
import type { EntityKey } from "./fields";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 20px 16px;
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 10px;
  border-radius: 10px;

  &:hover {
    background: var(--color-menu-hover);
  }
`;

const Art = styled.img<{ round?: boolean }>`
  width: 44px;
  height: 44px;
  border-radius: ${({ round }) => (round ? "50%" : "6px")};
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-menu-hover);
`;

const CardArt = styled.img<{ round?: boolean }>`
  width: 100%;
  aspect-ratio: 1;
  border-radius: ${({ round }) => (round ? "50%" : "8px")};
  object-fit: cover;
  background: var(--color-menu-hover);
`;

const Mosaic = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-menu-hover);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Body = styled.div`
  min-width: 0;
  flex: 1;
`;

const PrimaryText = styled.div`
  font-size: 0.9375rem;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SecondaryText = styled.div`
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.div`
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  white-space: nowrap;
`;

const CardTitle = styled(PrimaryText)`
  margin-top: 8px;
  font-size: 0.875rem;
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
`;

const Tag = styled.span`
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  font-size: 0.68rem;
  color: var(--color-text-muted);
`;

const PLACEHOLDER =
  "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";

const rkeyOf = (uri?: string) => uri?.split("/").pop() ?? "";
const didOf = (uri?: string) => uri?.replace("at://", "").split("/")[0] ?? "";

const formatDuration = (ms?: number) => {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function SongRows({ items }: { items: SongViewBasic[] }) {
  return (
    <Rows>
      {items.map((song, i) => (
        <Row key={song.id ?? i}>
          <Art src={song.albumArt || PLACEHOLDER} alt="" />
          <Body>
            {song.uri ? (
              <Link
                to="/$did/song/$rkey"
                params={{ did: didOf(song.uri), rkey: rkeyOf(song.uri) }}
              >
                <PrimaryText>{song.title}</PrimaryText>
              </Link>
            ) : (
              <PrimaryText>{song.title}</PrimaryText>
            )}
            <SecondaryText>
              {song.artist}
              {song.album ? ` — ${song.album}` : ""}
            </SecondaryText>
          </Body>
          <Meta>{formatDuration(song.duration)}</Meta>
        </Row>
      ))}
    </Rows>
  );
}

function AlbumCards({ items }: { items: AlbumViewBasic[] }) {
  return (
    <Grid>
      {items.map((album, i) => (
        <div key={album.id ?? i}>
          {album.uri ? (
            <Link
              to="/$did/album/$rkey"
              params={{ did: didOf(album.uri), rkey: rkeyOf(album.uri) }}
            >
              <CardArt src={album.albumArt || PLACEHOLDER} alt="" />
            </Link>
          ) : (
            <CardArt src={album.albumArt || PLACEHOLDER} alt="" />
          )}
          <CardTitle>{album.title}</CardTitle>
          <SecondaryText>{album.artist}</SecondaryText>
          {album.year ? <SecondaryText>{album.year}</SecondaryText> : null}
        </div>
      ))}
    </Grid>
  );
}

function ArtistCards({ items }: { items: ArtistViewBasic[] }) {
  return (
    <Grid>
      {items.map((artist, i) => (
        <div key={artist.id ?? i}>
          {artist.uri ? (
            <Link
              to="/$did/artist/$rkey"
              params={{ did: didOf(artist.uri), rkey: rkeyOf(artist.uri) }}
            >
              <CardArt round src={artist.picture || PLACEHOLDER} alt="" />
            </Link>
          ) : (
            <CardArt round src={artist.picture || PLACEHOLDER} alt="" />
          )}
          <CardTitle>{artist.name}</CardTitle>
          {artist.playCount ? (
            <SecondaryText>
              {numeral(artist.playCount).format("0,0")} plays
            </SecondaryText>
          ) : null}
          {artist.tags?.length ? (
            <Tags>
              {artist.tags.slice(0, 3).map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Tags>
          ) : null}
        </div>
      ))}
    </Grid>
  );
}

function PlaylistCards({ items }: { items: PlaylistViewBasic[] }) {
  return (
    <Grid>
      {items.map((playlist, i) => {
        const arts = playlist.trackArts?.filter(Boolean).slice(0, 4) ?? [];
        const cover = playlist.coverImageUrl;
        const inner =
          cover || arts.length < 4 ? (
            <CardArt src={cover || arts[0] || PLACEHOLDER} alt="" />
          ) : (
            <Mosaic>
              {arts.map((art) => (
                <img key={art} src={art} alt="" />
              ))}
            </Mosaic>
          );
        return (
          <div key={playlist.id ?? i}>
            {playlist.uri ? (
              <Link
                to="/$did/playlist/$rkey"
                params={{
                  did: didOf(playlist.uri),
                  rkey: rkeyOf(playlist.uri),
                }}
              >
                {inner}
              </Link>
            ) : (
              inner
            )}
            <CardTitle>{playlist.title}</CardTitle>
            <SecondaryText>
              {playlist.curatorName || `@${playlist.curatorHandle}`}
            </SecondaryText>
            <SecondaryText>
              {numeral(playlist.trackCount ?? 0).format("0,0")} tracks
            </SecondaryText>
          </div>
        );
      })}
    </Grid>
  );
}

/**
 * getScrobbles answers with cover/user/date where the lexicon declares
 * albumArt/handle/createdAt — the rest of the app already reads the former.
 */
type ScrobbleRow = ScrobbleViewBasic & {
  cover?: string;
  user?: string;
  userDisplayName?: string;
  date?: string;
};

const scrobbleArt = (s: ScrobbleRow) => s.cover || s.albumArt || PLACEHOLDER;
const scrobbleHandle = (s: ScrobbleRow) => s.user || s.handle;
const scrobbleDate = (s: ScrobbleRow) => s.date || s.createdAt;

function ScrobbleRows({ items }: { items: ScrobbleRow[] }) {
  return (
    <Rows>
      {items.map((scrobble, i) => (
        <Row key={scrobble.id ?? i}>
          <Art src={scrobbleArt(scrobble)} alt="" />
          <Body>
            {scrobble.uri ? (
              <Link
                to="/$did/scrobble/$rkey"
                params={{
                  did: didOf(scrobble.uri),
                  rkey: rkeyOf(scrobble.uri),
                }}
              >
                <PrimaryText>{scrobble.title}</PrimaryText>
              </Link>
            ) : (
              <PrimaryText>{scrobble.title}</PrimaryText>
            )}
            <SecondaryText>
              {scrobble.artist}
              {scrobbleHandle(scrobble) ? ` · @${scrobbleHandle(scrobble)}` : ""}
            </SecondaryText>
          </Body>
          <Meta>
            {scrobbleDate(scrobble)
              ? dayjs(scrobbleDate(scrobble)).fromNow()
              : ""}
          </Meta>
        </Row>
      ))}
    </Rows>
  );
}

export type ResultSet =
  | { key: "songs"; items: SongViewBasic[] }
  | { key: "albums"; items: AlbumViewBasic[] }
  | { key: "artists"; items: ArtistViewBasic[] }
  | { key: "playlists"; items: PlaylistViewBasic[] }
  | { key: "scrobbles"; items: ScrobbleRow[] };

export const resultCount = (result: ResultSet | undefined) =>
  result?.items.length ?? 0;

function Results({ result }: { result: ResultSet }) {
  switch (result.key) {
    case "songs":
      return <SongRows items={result.items} />;
    case "albums":
      return <AlbumCards items={result.items} />;
    case "artists":
      return <ArtistCards items={result.items} />;
    case "playlists":
      return <PlaylistCards items={result.items} />;
    case "scrobbles":
      return <ScrobbleRows items={result.items} />;
  }
}

export type { EntityKey };
export default Results;
