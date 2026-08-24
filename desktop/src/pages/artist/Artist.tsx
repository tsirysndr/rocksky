import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { Link, useParams } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import { HeadingMedium, HeadingXSmall, LabelMedium } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useState } from "react";
import { artistAtom } from "../../atoms/artist";
import ArtistIcon from "../../components/Icons/Artist";
import RecentListeners from "../../components/RecentListeners";
import Shout from "../../components/Shout/Shout";
import {
  useArtistAlbumsQuery,
  useArtistListenersQuery,
  useArtistQuery,
  useArtistRecentListenersQuery,
  useArtistTracksQuery,
} from "../../hooks/useLibrary";
import Main from "../../layouts/Main";
import Albums from "./Albums";
import ArtistListeners from "./ArtistListeners";
import PopularSongs from "./PopularSongs";
import ContentLoader from "react-content-loader";
import { PillLink } from "../../components/PillButton";
import ShareOnBluesky from "../../components/ShareOnBluesky";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
`;

const Artist = () => {
  const { did, rkey } = useParams({ strict: false });

  const uri = `at://${did}/app.rocksky.artist/${rkey}`;
  const artistResult = useArtistQuery(did!, rkey!);
  const artistTracksResult = useArtistTracksQuery(uri);
  const artistAlbumsResult = useArtistAlbumsQuery(uri);
  const artistListenersResult = useArtistListenersQuery(uri);
  const artistRecentListenersResult = useArtistRecentListenersQuery(uri);

  const artist = useAtomValue(artistAtom);
  const setArtist = useSetAtom(artistAtom);
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

  useEffect(() => {
    if (artistResult.isLoading || artistResult.isError) {
      return;
    }

    if (!artistResult.data || !did) {
      return;
    }

    setArtist({
      id: artistResult.data.id ?? "",
      name: artistResult.data.name ?? "",
      born: artistResult.data.born,
      bornIn: artistResult.data.bornIn,
      died: artistResult.data.died,
      listeners: artistResult.data.uniqueListeners ?? 0,
      scrobbles: artistResult.data.playCount ?? 0,
      picture: artistResult.data.picture,
      tags: artistResult.data.genres ?? [],
      uri: artistResult.data.uri ?? "",
      spotifyLink: artistResult.data.spotifyLink,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistResult.data, artistResult.isLoading, artistResult.isError, did]);

  useEffect(() => {
    if (artistTracksResult.isLoading || artistTracksResult.isError) {
      return;
    }

    if (!artistTracksResult.data || !did) {
      return;
    }

    setTopTracks(
      artistTracksResult.data.map((track) => ({
        ...track,
        id: track.id ?? "",
        title: track.title ?? "",
        artist: track.artist ?? "",
        albumArtist: track.albumArtist ?? "",
        albumArt: track.albumArt ?? "",
        uri: track.uri ?? "",
        scrobbles: track.playCount || 1,
      })),
    );
  }, [
    artistTracksResult.data,
    artistTracksResult.isLoading,
    artistTracksResult.isError,
    did,
  ]);

  useEffect(() => {
    if (artistAlbumsResult.isLoading || artistAlbumsResult.isError) {
      return;
    }

    if (!artistAlbumsResult.data || !did) {
      return;
    }

    setTopAlbums(
      artistAlbumsResult.data.map((album) => ({
        ...album,
        id: album.id ?? "",
        title: album.title ?? "",
        artist: album.artist ?? "",
        albumArt: album.albumArt ?? "",
        artistUri: album.artistUri ?? "",
        uri: album.uri ?? "",
      })),
    );
  }, [
    artistAlbumsResult.data,
    artistAlbumsResult.isLoading,
    artistAlbumsResult.isError,
    did,
  ]);

  const loading =
    artistResult.isLoading ||
    artistTracksResult.isLoading ||
    artistAlbumsResult.isLoading;

  return (
    <Main>
      <div className="pb-[100px] pt-[50px]">
        <div className="mb-[50px]">
          {loading && (
            <ContentLoader
              width="100%"
              height={200}
              viewBox="0 0 800 200"
              backgroundColor="var(--color-skeleton-background)"
              foregroundColor="var(--color-skeleton-foreground)"
            >
              {/* Avatar circle */}
              <circle cx="75" cy="75" r="75" />
              {/* Artist name */}
              <rect x="180" y="40" rx="4" ry="4" width="300" height="24" />
              {/* Listeners label */}
              <rect x="180" y="90" rx="3" ry="3" width="80" height="12" />
              {/* Listeners count */}
              <rect x="180" y="110" rx="3" ry="3" width="100" height="20" />
              {/* Scrobbles label */}
              <rect x="300" y="90" rx="3" ry="3" width="80" height="12" />
              {/* Scrobbles count */}
              <rect x="300" y="110" rx="3" ry="3" width="100" height="20" />
              {/* View on PDSls button */}
              <rect x="620" y="100" rx="8" ry="8" width="180" height="48" />
            </ContentLoader>
          )}
          {!loading && (
            <Group>
              <div className="mr-[20px]">
                {artist?.picture && (
                  <Avatar
                    name={artist?.name}
                    src={artist?.picture}
                    size="150px"
                  />
                )}
                {!artist?.picture && (
                  <div className="w-[150px] h-[150px] rounded-[80px] bg-[rgba(243, 243, 243, 0.725)] flex items-center justify-center">
                    <div
                      style={{
                        height: 60,
                        width: 60,
                      }}
                    >
                      <ArtistIcon color="rgba(66, 87, 108, 0.65)" />
                    </div>
                  </div>
                )}
              </div>
              {artist && (
                <div style={{ flex: 1 }}>
                  <HeadingMedium
                    marginTop={"20px"}
                    marginBottom={0}
                    className="!text-[var(--color-text)]"
                  >
                    {artist?.name}
                  </HeadingMedium>
                  <div className="mt-[20px] flex flex-row">
                    <div className="mr-[20px]">
                      <LabelMedium
                        margin={0}
                        className="!text-[var(--color-text-muted)]"
                      >
                        Listeners
                      </LabelMedium>
                      <HeadingXSmall
                        margin={0}
                        className="!text-[var(--color-text)]"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {numeral(artist?.listeners).format("0,0")}
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
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {numeral(artist?.scrobbles).format("0,0")}
                      </HeadingXSmall>
                    </div>
                  </div>
                </div>
              )}
            </Group>
          )}

          {artist && (
            <div className="flex items-center gap-[12px] mt-[20px]">
              <PillLink
                href={`https://pdsls.dev/at/${uri.replace("at://", "")}`}
                target="_blank"
              >
                <ExternalLink size={16} />
                View on PDSls
              </PillLink>
              <ShareOnBluesky
                text={`Listening to ${artist?.name} on Rocksky 🎵\n${window.location.href}`}
              />
            </div>
          )}

          {artist && (
            <div className="mt-[30px]">
              {(artist?.tags || []).map((genre) => (
                <Link
                  to={`/genre/${genre}` as string}
                  className="mr-[15px] text-[var(--color-genre)] text-[13px] no-underline"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  # {genre}
                </Link>
              ))}
            </div>
          )}
        </div>
        <RecentListeners
          listeners={artistRecentListenersResult.data}
          isLoading={artistRecentListenersResult.isLoading}
        />
        <PopularSongs
          topTracks={topTracks}
          isLoading={artistTracksResult.isLoading}
        />
        <Albums topAlbums={topAlbums} />
        <ArtistListeners listeners={artistListenersResult.data} />
        <Shout type="artist" />
      </div>
    </Main>
  );
};

export default Artist;
