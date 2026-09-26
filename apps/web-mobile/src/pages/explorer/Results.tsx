import styled from "@emotion/styled";
import type {
  AlbumViewBasic,
  ArtistViewBasic,
  PlaylistViewBasic,
  ScrobbleViewBasic,
  SongViewBasic,
} from "@rocksky/sdk";
import dayjs from "dayjs";
import numeral from "numeral";
import { Link } from "react-router-dom";
import { PLACEHOLDER_ALBUM_ART } from "../../lib/albumArt";

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 18px 14px;
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--color-border);
`;

const Art = styled.img<{ round?: boolean }>`
  width: 44px;
  height: 44px;
  border-radius: ${({ round }) => (round ? "50%" : "6px")};
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-surface-2);
`;

const CardArt = styled.img<{ round?: boolean }>`
  width: 100%;
  aspect-ratio: 1;
  border-radius: ${({ round }) => (round ? "50%" : "8px")};
  object-fit: cover;
  background: var(--color-surface-2);
`;

const Mosaic = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-surface-2);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Body = styled.div`
  min-width: 0;
  flex: 1;

  a {
    text-decoration: none;
    color: inherit;
  }
`;

const PrimaryText = styled.div`
  font-size: 0.875rem;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SecondaryText = styled.div`
  font-size: 0.75rem;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Meta = styled.div`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
`;

const CardTitle = styled(PrimaryText)`
  margin-top: 8px;
`;

const CardLink = styled(Link)`
  display: block;
  text-decoration: none;
  color: inherit;
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
  border: 1px solid var(--color-border);
  font-size: 0.65rem;
  color: var(--color-text-muted);
`;

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
          <Art src={song.albumArt || PLACEHOLDER_ALBUM_ART} alt="" />
          <Body>
            {song.uri ? (
              <Link to={`/${didOf(song.uri)}/song/${rkeyOf(song.uri)}`}>
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
            <CardLink to={`/${didOf(album.uri)}/album/${rkeyOf(album.uri)}`}>
              <CardArt src={album.albumArt || PLACEHOLDER_ALBUM_ART} alt="" />
            </CardLink>
          ) : (
            <CardArt src={album.albumArt || PLACEHOLDER_ALBUM_ART} alt="" />
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
            <CardLink to={`/${didOf(artist.uri)}/artist/${rkeyOf(artist.uri)}`}>
              <CardArt
                round
                src={artist.picture || PLACEHOLDER_ALBUM_ART}
                alt=""
              />
            </CardLink>
          ) : (
            <CardArt
              round
              src={artist.picture || PLACEHOLDER_ALBUM_ART}
              alt=""
            />
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

/** Cards are inert here: the mobile app has no page for a global playlist. */
function PlaylistCards({ items }: { items: PlaylistViewBasic[] }) {
  return (
    <Grid>
      {items.map((playlist, i) => {
        const arts = playlist.trackArts?.filter(Boolean).slice(0, 4) ?? [];
        const cover = playlist.coverImageUrl;
        return (
          <div key={playlist.id ?? i}>
            {cover || arts.length < 4 ? (
              <CardArt src={cover || arts[0] || PLACEHOLDER_ALBUM_ART} alt="" />
            ) : (
              <Mosaic>
                {arts.map((art) => (
                  <img key={art} src={art} alt="" />
                ))}
              </Mosaic>
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

const scrobbleArt = (s: ScrobbleRow) =>
  s.cover || s.albumArt || PLACEHOLDER_ALBUM_ART;
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
                to={`/${didOf(scrobble.uri)}/scrobble/${rkeyOf(scrobble.uri)}`}
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

export default Results;
