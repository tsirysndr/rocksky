import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { KIND, Tag } from "baseui/tag";
import {
  HeadingMedium,
  HeadingXSmall,
  LabelLarge,
  LabelMedium,
} from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { Link as DefaultLink, useParams } from "react-router";
import { songAtom } from "../../atoms/song";
import Disc from "../../components/Icons/Disc";
import Shout from "../../components/Shout/Shout";
import SongCover from "../../components/SongCover";
import { useFeedByUriQuery } from "../../hooks/useFeed";
import {
  useArtistAlbumsQuery,
  useArtistTracksQuery,
  useSongByUriQuery,
} from "../../hooks/useLibrary";
import Main from "../../layouts/Main";
import Credits from "./Credits";
import PopularAlbums from "./PopularAlbums";
import PopularTracks from "./PopularTracks";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
`;

const Link = styled(DefaultLink)`
  text-decoration: none;
  color: #000;
  &:hover {
    text-decoration: underline;
  }
`;

const ShowMore = styled.div`
  display: flex;
  justify-content: start;
  align-items: center;
  cursor: pointer;
  margin-top: -10px;
  width: 140px;
  &:hover {
    text-decoration: underline;
  }
`;

const Song = () => {
  const { did, rkey } = useParams<{ did: string; rkey: string }>();

  let uri = `at://${did}/app.rocksky.scrobble/${rkey}`;

  if (window.location.pathname.includes("app.rocksky.song")) {
    uri = `at://${did}/app.rocksky.song/${rkey}`;
  }
  if (window.location.pathname.includes("app.rocksky.scrobble")) {
    uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
  }

  const scrobbleResult = useFeedByUriQuery(uri);
  const songResult = useSongByUriQuery(uri);

  const artistTracksResult = useArtistTracksQuery(
    songResult.data?.artistUri || scrobbleResult.data?.artistUri,
    5
  );
  const artistAlbumResult = useArtistAlbumsQuery(
    songResult.data?.artistUri || scrobbleResult.data?.artistUri,
    10
  );

  const song = useAtomValue(songAtom);
  const setSong = useSetAtom(songAtom);
  const [lyricsMaxLines, setLyricsMaxLines] = useState(8);
  const [topTracks, setTopTracks] = useState<
    {
      id: string;
      title: string;
      artist: string;
      albumArtist: string;
      albumArt: string;
      uri: string;
      scrobbles: number;
      albumUri?: string;
      artistUri?: string;
    }[]
  >([]);
  const [topAlbums, setTopAlbums] = useState<
    {
      id: string;
      title: string;
      artist: string;
      albumArt: string;
      artistUri: string;
      uri: string;
    }[]
  >([]);

  const onShowMore = () => {
    if (lyricsMaxLines === 8) {
      setLyricsMaxLines(song?.lyrics?.split("\n").length || 0);
    } else {
      setLyricsMaxLines(8);
    }
  };

  useEffect(() => {
    if (!window.location.pathname.includes("app.rocksky.song")) {
      return;
    }

    if (songResult.isLoading || songResult.isError) {
      return;
    }

    if (!songResult.data || !did) {
      return;
    }

    setSong(songResult.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songResult.data, songResult.isLoading, songResult.isError, did]);

  useEffect(() => {
    if (!window.location.pathname.includes("app.rocksky.scrobble")) {
      return;
    }

    if (scrobbleResult.isLoading || scrobbleResult.isError) {
      return;
    }

    if (!scrobbleResult.data || !did) {
      return;
    }

    setSong(scrobbleResult.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrobbleResult.data, scrobbleResult.isLoading, scrobbleResult.isError]);

  useEffect(() => {
    if (artistTracksResult.isLoading || artistTracksResult.isError) {
      return;
    }

    if (!artistTracksResult.data || !did) {
      return;
    }

    setTopTracks(
      artistTracksResult.data.map((x) => ({
        id: x.id,
        title: x.title,
        artist: x.artist,
        albumArtist: x.albumArtist,
        albumArt: x.albumArt,
        uri: x.uri,
        artistUri: x.artistUri,
        scrobbles: x.playCount,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistTracksResult.data, artistTracksResult.isLoading]);

  useEffect(() => {
    if (artistAlbumResult.isLoading || artistAlbumResult.isError) {
      return;
    }

    if (!artistAlbumResult.data || !did) {
      return;
    }

    setTopAlbums(artistAlbumResult.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistAlbumResult.data, artistAlbumResult.isLoading]);

  const loading =
    songResult.isLoading ||
    artistTracksResult.isLoading ||
    artistAlbumResult.isLoading;

  return (
    <Main>
      <div className="pb-[100px] pt-[100px]">
        {loading && (
          <ContentLoader
            backgroundColor="var(--color-skeleton-background)"
            foregroundColor="var(--color-skeleton-foreground)"
            viewBox="0 0 520 160"
            height={160}
            width={400}
          >
            <rect x="220" y="21" rx="10" ry="10" width="294" height="20" />
            <rect x="221" y="61" rx="10" ry="10" width="185" height="20" />
            <rect x="304" y="-46" rx="3" ry="3" width="350" height="6" />
            <rect x="371" y="-45" rx="3" ry="3" width="380" height="6" />
            <rect x="484" y="-45" rx="3" ry="3" width="201" height="6" />
            <rect x="48" y="21" rx="8" ry="8" width="150" height="150" />
          </ContentLoader>
        )}
        {!loading && song && (
          <>
            <Group>
              {song?.albumUri && (
                <Link to={`/${song.albumUri.split("at://")[1]}`}>
                  {song.cover && <SongCover cover={song?.cover} size={150} />}
                  {!song.cover && (
                    <div className="w-[150px] h-[150px] mr-[12px] rounded-[8px] bg-[rgba(243, 243, 243, 0.725)] flex justify-center items-center">
                      <div className="h-[90px] w-[90px]">
                        <Disc color="rgba(66, 87, 108, 0.65)" />
                      </div>
                    </div>
                  )}
                </Link>
              )}
              {!song?.albumUri && (
                <>
                  {song.cover && <SongCover cover={song?.cover} size={150} />}
                  {!song.cover && (
                    <div className="w-[150px] h-[150px] mr-[12px] rounded-[8px] bg-[rgba(243, 243, 243, 0.725)] flex justify-center items-center">
                      <div className="w-[90px] h-[90px]">
                        <Disc color="rgba(66, 87, 108, 0.65)" />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="ml-[20px] flex-1">
                <HeadingMedium margin={0} className="!text-[var(--color-text)]">
                  {song?.title}
                </HeadingMedium>
                {song?.artistUri && (
                  <Link to={`/${song.artistUri.split("at://")[1]}`}>
                    <LabelLarge
                      margin={0}
                      className="!text-[var(--color-text)]"
                    >
                      {song?.albumArtist}
                    </LabelLarge>
                  </Link>
                )}
                {!song?.artistUri && (
                  <LabelLarge margin={0} className="!text-[var(--color-text)]">
                    {song?.albumArtist}
                  </LabelLarge>
                )}
                <div className="mt-[20px] flex flex-row">
                  <div
                    style={{
                      marginRight: 20,
                    }}
                  >
                    <LabelMedium
                      margin={0}
                      className="!text-[var(--color-text-muted)]"
                    >
                      Listeners
                    </LabelMedium>
                    <HeadingXSmall
                      margin={0}
                      className="!text-[var(--color-text)]"
                    >
                      {numeral(song?.listeners).format("0,0")}
                    </HeadingXSmall>
                  </div>
                  <div>
                    <LabelMedium
                      margin={0}
                      className="!text-[var(--color-text-muted)]"
                    >
                      Scrobbles
                    </LabelMedium>
                    <HeadingXSmall
                      margin={0}
                      className="!text-[var(--color-text)]"
                    >
                      {numeral(song?.scrobbles).format("0,0")}
                    </HeadingXSmall>
                  </div>
                  <div className="flex items-center justify-end flex-1 mr-[10px]">
                    <a
                      href={`https://pdsls.dev/at/${uri}`}
                      target="_blank"
                      className="text-[var(--color-text)] no-underline bg-[var(--color-default-button)] rounded-[10px] p-[16px] pl-[25px] pr-[25px]"
                    >
                      <ExternalLink
                        size={24}
                        className="mr-[10px] text-[var(--color-text)]"
                      />
                      View on PDSls
                    </a>
                  </div>
                </div>
              </div>
            </Group>

            {// eslint-disable-next-line @typescript-eslint/no-explicit-any
            song?.tags.map((tag: any) => (
              <Tag closeable={false} kind={KIND.purple}>
                {tag}
              </Tag>
            ))}

            {song?.lyrics && (
              <>
                <HeadingXSmall
                  marginTop={"20px"}
                  marginBottom={"0px"}
                  className="!text-[var(--color-text)]"
                >
                  Lyrics
                </HeadingXSmall>
                <div className="mt-[10px] mb-[40px]">
                  {song.lyrics
                    .replace(/\[\d{2}:\d{2}\.\d{2}\]\s*/g, "")
                    .split("\n")
                    .slice(0, lyricsMaxLines)
                    .map((line: string, index: number) => (
                      <p
                        key={index}
                        style={{
                          whiteSpace: "pre-line",
                          lineHeight: "1.5",
                          fontSize: "20px",
                          margin: 0,
                        }}
                      >
                        {line}
                      </p>
                    ))}
                  <ShowMore onClick={onShowMore}>
                    <LabelMedium
                      marginTop={"20px"}
                      className="!text-[var(--color-text)] text-center"
                    >
                      {lyricsMaxLines < song.lyrics.split("\n").length
                        ? "Show More..."
                        : "Show Less..."}
                    </LabelMedium>
                  </ShowMore>
                </div>
              </>
            )}

            {
              <Credits
                composers={
                  song?.composer
                    ? song?.composer.split(",").map((x) => x.trim())
                    : null
                }
              />
            }
            {song?.artistUri && (
              <>
                <PopularTracks
                  topTracks={topTracks}
                  artist={song.albumArtist}
                />
                <PopularAlbums
                  topAlbums={topAlbums}
                  artist={song.albumArtist}
                />
              </>
            )}

            <Shout type="song" />
          </>
        )}
      </div>
    </Main>
  );
};

export default Song;
