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
import Shout from "../../components/Shout/Shout";
import {
  useArtistAlbumsQuery,
  useArtistListenersQuery,
  useArtistQuery,
  useArtistTracksQuery,
} from "../../hooks/useLibrary";
import Main from "../../layouts/Main";
import Albums from "./Albums";
import ArtistListeners from "./ArtistListeners";
import PopularSongs from "./PopularSongs";

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
      id: artistResult.data.id,
      name: artistResult.data.name,
      born: artistResult.data.born,
      bornIn: artistResult.data.bornIn,
      died: artistResult.data.died,
      listeners: artistResult.data.uniqueListeners,
      scrobbles: artistResult.data.playCount,
      picture: artistResult.data.picture,
      tags: artistResult.data.genres,
      uri: artistResult.data.uri,
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

    setTopAlbums(artistAlbumsResult.data);
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
          <Group>
            <div className="mr-[20px]">
              {artist?.picture && !loading && (
                <Avatar
                  name={artist?.name}
                  src={artist?.picture}
                  size="150px"
                />
              )}
              {!artist?.picture && !loading && (
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
            {artist && !loading && (
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
                    >
                      {numeral(artist?.scrobbles).format("0,0")}
                    </HeadingXSmall>
                  </div>
                  <div className="flex items-center justify-end flex-1 mr-[10px]">
                    <a
                      href={`https://pdsls.dev/at/${uri.replace("at://", "")}`}
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
            )}
          </Group>

          {artist && (
            <div className="mt-[30px]">
              {(artist?.tags || []).map((genre) => (
                <Link
                  to={`/genre/${genre}` as string}
                  className="mr-[15px] text-[var(--color-genre)] text-[13px] no-underline"
                  style={{ fontFamily: "RockfordSansRegular" }}
                >
                  # {genre}
                </Link>
              ))}
            </div>
          )}
        </div>
        <PopularSongs topTracks={topTracks} />
        <Albums topAlbums={topAlbums} />
        <ArtistListeners listeners={artistListenersResult.data} />
        <Shout type="artist" />
      </div>
    </Main>
  );
};

export default Artist;
