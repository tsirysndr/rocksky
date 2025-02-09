import styled from "@emotion/styled";
import { Button } from "baseui/button";
import { KIND, Tag } from "baseui/tag";
import { Textarea } from "baseui/textarea";
import {
  HeadingMedium,
  HeadingXSmall,
  LabelLarge,
  LabelMedium,
  LabelSmall,
} from "baseui/typography";
import { useAtomValue } from "jotai";
import numeral from "numeral";
import { useEffect, useState } from "react";
import ContentLoader from "react-content-loader";
import { useParams } from "react-router";
import { profileAtom } from "../../atoms/profile";
import SongCover from "../../components/SongCover";
import useFeed from "../../hooks/useFeed";
import useLibrary from "../../hooks/useLibrary";
import Main from "../../layouts/Main";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
`;

const Song = () => {
  const profile = useAtomValue(profileAtom);
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const { getFeedByUri } = useFeed();
  const { getSongByUri } = useLibrary();
  const [song, setSong] = useState<any>(null);
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
              <SongCover cover={song?.cover} size={150} />
              <div style={{ marginLeft: 20 }}>
                <HeadingMedium margin={0}>{song?.title}</HeadingMedium>
                <LabelLarge margin={0}>{song?.artist}</LabelLarge>
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

            <div style={{ marginTop: 150 }}>
              <LabelMedium marginBottom={"10px"}>Shoutbox</LabelMedium>
              {profile && (
                <>
                  <Textarea
                    placeholder={`@${profile?.handle}, share your thoughts about this song`}
                    resize="vertical"
                    overrides={{
                      Input: {
                        style: {
                          width: "770px",
                        },
                      },
                    }}
                    maxLength={1000}
                  />
                  <div
                    style={{
                      marginTop: 15,
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <Button disabled>Post Shout</Button>
                  </div>
                </>
              )}
              {!profile && (
                <LabelMedium marginTop={"20px"}>
                  Want to share your thoughts? Sign in to leave a shout.
                </LabelMedium>
              )}
            </div>
          </>
        )}
      </div>
    </Main>
  );
};

export default Song;
