import styled from "@emotion/styled";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingMedium, LabelMedium } from "baseui/typography";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Link } from "react-router";
import SongCover from "../../../components/SongCover";
import useFeed from "../../../hooks/useFeed";

dayjs.extend(relativeTime);

const itemProps: BlockProps = {
  display: "flex",
  alignItems: "flex-start",
  flexDirection: "column",
};

const Container = styled.div`
  @media (max-width: 1152px) {
    margin-left: 20px;
    margin-right: 20px;
  }
`;

function Feed() {
  const { getFeed } = useFeed();
  const data = getFeed();
  return (
    <Container>
      <HeadingMedium marginTop={"50px"} marginBottom={"20px"}>
        Recently played
      </HeadingMedium>

      <div style={{ paddingBottom: 100 }}>
        <FlexGrid
          flexGridColumnCount={[1, 2, 3]}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale800"
        >
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.map((song: any) => (
              <FlexGridItem {...itemProps} key={song.id}>
                <Link to={`/${song.uri.split("at://")[1]}`}>
                  <SongCover
                    cover={song.cover}
                    artist={song.artist}
                    title={song.title}
                  />
                </Link>
                <LabelMedium color={"#ff2876"}>@{song.user}</LabelMedium>
                <LabelMedium>is listening to this song</LabelMedium>
                <StatefulTooltip
                  content={dayjs(song.date).format("MMMM D, YYYY [at] HH:mm A")}
                  returnFocus
                  autoFocus
                >
                  <LabelMedium color="#42576ca6">
                    {dayjs(song.date).fromNow()}
                  </LabelMedium>
                </StatefulTooltip>
              </FlexGridItem>
            ))
          }
        </FlexGrid>
      </div>
    </Container>
  );
}

export default Feed;
