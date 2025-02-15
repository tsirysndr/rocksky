import styled from "@emotion/styled";
import { KIND, Tag } from "baseui/tag";
import {
  HeadingMedium,
  HeadingXSmall,
  LabelLarge,
  LabelSmall,
} from "baseui/typography";
import { useAtomValue } from "jotai";
import numeral from "numeral";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { Link as DefaultLink, useParams } from "react-router";
import { profileAtom } from "../../atoms/profile";
import Disc from "../../components/Icons/Disc";
import Shout from "../../components/Shout/Shout";
import SongCover from "../../components/SongCover";
import useFeed from "../../hooks/useFeed";
import useLibrary from "../../hooks/useLibrary";
import Main from "../../layouts/Main";

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

const Song = () => {
  const profile = useAtomValue(profileAtom);
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const { getFeedByUri } = useFeed();
  const { getSongByUri } = useLibrary();
  const [song, setSong] = useState<{
    title: string;
    albumArtist: string;
    cover: string;
    listeners: number;
    tags: string[];
    lyrics?: string;
    artistUri?: string;
    albumUri?: string;
  } | null>(null);
  useEffect(() => {
    const getSong = async () => {
      // if path contains app.rocksky.scrobble, get the song
      if (window.location.pathname.includes("app.rocksky.scrobble")) {
        const data = await getFeedByUri(`${did}/app.rocksky.scrobble/${rkey}`);
        setSong(data);
      }

      // if path contains app.rocksky.track, get the song
      if (window.location.pathname.includes("app.rocksky.song")) {
        const data = await getSongByUri(`${did}/app.rocksky.song/${rkey}`);
        setSong(data);
      }
    };
    getSong();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [did, rkey]);

  return (
    <Main>
      <div style={{ paddingBottom: 100, paddingTop: 50 }}>
        {!song && (
          <ContentLoader viewBox="0 0 520 160" height={160} width={400}>
            <rect x="220" y="21" rx="10" ry="10" width="294" height="20" />
            <rect x="221" y="61" rx="10" ry="10" width="185" height="20" />
            <rect x="304" y="-46" rx="3" ry="3" width="350" height="6" />
            <rect x="371" y="-45" rx="3" ry="3" width="380" height="6" />
            <rect x="484" y="-45" rx="3" ry="3" width="201" height="6" />
            <rect x="48" y="21" rx="8" ry="8" width="150" height="150" />
          </ContentLoader>
        )}
        {song && (
          <>
            <Group>
              {song?.albumUri && (
                <Link to={`/${song.albumUri.split("at://")[1]}`}>
                  {song.cover && <SongCover cover={song?.cover} size={150} />}
                  {!song.cover && (
                    <div
                      style={{
                        width: 150,
                        height: 150,
                        marginRight: 12,
                        borderRadius: 8,
                        backgroundColor: "rgba(243, 243, 243, 0.725)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          height: 90,
                          width: 90,
                        }}
                      >
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
                    <div
                      style={{
                        width: 150,
                        height: 150,
                        marginRight: 12,
                        borderRadius: 8,
                        backgroundColor: "rgba(243, 243, 243, 0.725)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          height: 90,
                          width: 90,
                        }}
                      >
                        <Disc color="rgba(66, 87, 108, 0.65)" />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div style={{ marginLeft: 20 }}>
                <HeadingMedium margin={0}>{song?.title}</HeadingMedium>
                {song?.artistUri && (
                  <Link to={`/${song.artistUri.split("at://")[1]}`}>
                    <LabelLarge margin={0}>{song?.albumArtist}</LabelLarge>
                  </Link>
                )}
                {!song?.artistUri && (
                  <LabelLarge margin={0}>{song?.albumArtist}</LabelLarge>
                )}
                <LabelSmall marginTop={"15px"}>Listeners</LabelSmall>
                <HeadingXSmall margin={0}>
                  {numeral(song?.listeners).format("0,0")}
                </HeadingXSmall>
              </div>
            </Group>
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              song?.tags.map((tag: any) => (
                <Tag closeable={false} kind={KIND.purple}>
                  {tag}
                </Tag>
              ))
            }

            {song?.lyrics && (
              <>
                <HeadingXSmall marginTop={"20px"} marginBottom={"0px"}>
                  Lyrics
                </HeadingXSmall>
                <div style={{ marginTop: 10 }}>
                  <p
                    style={{
                      whiteSpace: "pre-line",
                      lineHeight: "2",
                      fontSize: "20px",
                    }}
                  >
                    {song.lyrics.replace(/\[\d{2}:\d{2}\.\d{2}\]\s*/g, "")}
                  </p>
                </div>
              </>
            )}

            <Shout />
          </>
        )}
      </div>
    </Main>
  );
};

export default Song;
