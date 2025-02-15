import styled from "@emotion/styled";
import { Avatar } from "baseui/avatar";
import { HeadingMedium, HeadingXSmall, LabelSmall } from "baseui/typography";
import numeral from "numeral";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import ArtistIcon from "../../components/Icons/Artist";
import useLibrary from "../../hooks/useLibrary";
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
  const { getArtist, getArtistTracks, getArtistAlbums } = useLibrary();
  const [artist, setArtist] = useState<{
    id: string;
    name: string;
    born?: string;
    bornIn?: string;
    died?: string;
    listeners: number;
    picture?: string;
    tags: string[];
    uri: string;
  } | null>(null);
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
    if (!did || !rkey) {
      return;
    }
    const fetchArtist = async () => {
      const data = await getArtist(did, rkey);
      setArtist({
        id: data.xata_id,
        name: data.name,
        born: data.born,
        bornIn: data.born_in,
        died: data.died,
        listeners: data.listeners,
        picture: data.picture,
        tags: data.tags,
        uri: data.uri,
      });
    };
    fetchArtist();

    const fetchArtistTracks = async () => {
      const uri = `${did}/app.rocksky.artist/${rkey}`;
      const data = await getArtistTracks(uri, 10);
      setTopTracks(
        data.map((x) => ({
          id: x.xata_id,
          title: x.title,
          artist: x.artist,
          albumArtist: x.album_artist,
          albumArt: x.album_art,
          uri: x.uri,
          scrobbles: x.scrobbles,
          albumUri: x.album_uri,
          artistUri: x.artist_uri,
        }))
      );
    };
    fetchArtistTracks();

    const fetchArtistAlbums = async () => {
      const uri = `${did}/app.rocksky.artist/${rkey}`;
      const data = await getArtistAlbums(uri, 10);
      setTopAlbums(
        data.map((x) => ({
          id: x.xata_id,
          title: x.title,
          artist: x.artist,
          album_art: x.album_art,
          artist_uri: x.artist_uri,
          uri: x.uri,
        }))
      );
    };
    fetchArtistAlbums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, rkey]);

  return (
    <Main>
      <div style={{ paddingBottom: 100, paddingTop: 50 }}>
        <Group>
          <div style={{ marginRight: 20 }}>
            {artist?.picture && (
              <Avatar name={artist?.name} src={artist?.picture} size="150px" />
            )}
            {!artist?.picture && (
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
          {artist && (
            <div>
              <HeadingMedium marginBottom={0}>{artist?.name}</HeadingMedium>
              <LabelSmall marginTop={"15px"}>Listeners</LabelSmall>
              <HeadingXSmall margin={0}>
                {numeral(artist?.listeners).format("0,0")}
              </HeadingXSmall>
            </div>
          )}
        </Group>

        <PopularSongs topTracks={topTracks} />
        <Albums topAlbums={topAlbums} />
      </div>
    </Main>
  );
};

export default Artist;
