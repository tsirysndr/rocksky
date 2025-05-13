import styled from "@emotion/styled";
import { ExternalLink } from "@styled-icons/evaicons-solid";
import { Avatar } from "baseui/avatar";
import { HeadingMedium, HeadingXSmall, LabelMedium } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import numeral from "numeral";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { artistAtom } from "../../atoms/artist";
import ArtistIcon from "../../components/Icons/Artist";
import Shout from "../../components/Shout/Shout";
import {
  useArtistAlbumsQuery,
  useArtistQuery,
  useArtistTracksQuery,
} from "../../hooks/useLibrary";
import Main from "../../layouts/Main";
import Albums from "./Albums";
import PopularSongs from "./PopularSongs";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
  margin-bottom: 50px;
`;

const Artist = () => {
  const { did, rkey } = useParams<{ did: string; rkey: string }>();

  const uri = `${did}/app.rocksky.artist/${rkey}`;
  const artistResult = useArtistQuery(did!, rkey!);
  const artistTracksResult = useArtistTracksQuery(uri);
  const artistAlbumsResult = useArtistAlbumsQuery(uri);

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
      album_art: string;
      artist_uri: string;
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
      bornIn: artistResult.data.born_in,
      died: artistResult.data.died,
      listeners: artistResult.data.listeners,
      scrobbles: artistResult.data.scrobbles,
      picture: artistResult.data.picture,
      tags: artistResult.data.tags,
      uri: artistResult.data.uri,
      spotifyLink: artistResult.data.spotify_link,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artistTracksResult.data.map((track: any) => ({
        ...track,
        albumArt: track.album_art,
        albumArtist: track.album_artist,
        albumUri: track.album_uri,
        artistUri: track.artist_uri,
      }))
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artistAlbumsResult.data.map((album: any) => ({
        ...album,
        albumArt: album.album_art,
        albumArtist: album.album_artist,
        albumUri: album.album_uri,
        artistUri: album.artist_uri,
      }))
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
      <div style={{ paddingBottom: 100, paddingTop: 50 }}>
        <Group>
          <div style={{ marginRight: 20 }}>
            {artist?.picture && !loading && (
              <Avatar name={artist?.name} src={artist?.picture} size="150px" />
            )}
            {!artist?.picture && !loading && (
              <div
                style={{
                  width: 150,
                  height: 150,
                  marginRight: 12,
                  borderRadius: 80,
                  backgroundColor: "rgba(243, 243, 243, 0.725)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
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
              <HeadingMedium marginTop={"20px"} marginBottom={0}>
                {artist?.name}
              </HeadingMedium>
              <div
                style={{ marginTop: 20, display: "flex", flexDirection: "row" }}
              >
                <div
                  style={{
                    marginRight: 20,
                  }}
                >
                  <LabelMedium margin={0} color="rgba(36, 49, 61, 0.65)">
                    Listeners
                  </LabelMedium>
                  <HeadingXSmall margin={0}>
                    {numeral(artist?.listeners).format("0,0")}
                  </HeadingXSmall>
                </div>
                <div>
                  <LabelMedium margin={0} color="rgba(36, 49, 61, 0.65)">
                    Scrobbles
                  </LabelMedium>
                  <HeadingXSmall margin={0}>
                    {numeral(artist?.scrobbles).format("0,0")}
                  </HeadingXSmall>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "end",
                    flex: 1,
                    marginRight: 10,
                  }}
                >
                  <div>
                    <a
                      href={`https://pdsls.dev/at/${uri}`}
                      target="_blank"
                      style={{
                        color: "#000",
                        textDecoration: "none",
                        padding: 16,
                        backgroundColor: "rgba(0, 0, 0, 0.05)",
                        fontWeight: 600,
                        borderRadius: 10,
                        paddingLeft: 25,
                        paddingRight: 25,
                      }}
                    >
                      <ExternalLink size={24} style={{ marginRight: 10 }} />
                      View on PDSls
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Group>

        <PopularSongs topTracks={topTracks} />
        <Albums topAlbums={topAlbums} />

        <Shout type="artist" />
      </div>
    </Main>
  );
};

export default Artist;
