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
import numeral from "numeral";
import { useMemo } from "react";
import { useParams } from "react-router";
import SongCover from "../../components/SongCover";
import useFeed from "../../hooks/useFeed";
import Main from "../../layouts/Main";

const Group = styled.div`
  display: flex;
  flex-direction: row;
  margin-top: 20px;
`;

const Song = () => {
  const { id } = useParams<{ id: string }>();
  const { getFeedById } = useFeed();
  const song = useMemo(() => {
    return getFeedById(id!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <Main>
      <div style={{ paddingBottom: 100, paddingTop: 50 }}>
        <Group>
          <SongCover cover={song!.cover} size={150} />
          <div style={{ marginLeft: 20 }}>
            <HeadingMedium margin={0}>{song?.title}</HeadingMedium>
            <LabelLarge margin={0}>{song?.artist}</LabelLarge>
            <LabelSmall marginTop={"15px"}>Listeners</LabelSmall>
            <HeadingXSmall margin={0}>
              {numeral(song?.listeners).format("0,0")}
            </HeadingXSmall>
          </div>
        </Group>

        {song?.tags.map((tag) => (
          <Tag closeable={false} kind={KIND.purple}>
            {tag}
          </Tag>
        ))}

        <div style={{ marginTop: 150 }}>
          <LabelMedium marginBottom={"10px"}>Shoutbox</LabelMedium>
          <Textarea
            placeholder="@tsiry-sandratraina.com, share your thoughts about this song"
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
        </div>
      </div>
    </Main>
  );
};

export default Song;
