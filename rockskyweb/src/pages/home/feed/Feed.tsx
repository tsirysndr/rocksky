import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
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

function Feed() {
  const { getFeed } = useFeed();
  const data = getFeed();
  return (
    <>
      <HeadingMedium marginTop={"50px"} marginBottom={"20px"}>
        Recently played
      </HeadingMedium>

      <div style={{ paddingBottom: 100 }}>
        <FlexGrid
          flexGridColumnCount={3}
          flexGridColumnGap="scale800"
          flexGridRowGap="scale800"
        >
          {data.map((song) => (
            <FlexGridItem {...itemProps} key={song.id}>
              <Link to={`/songs/${song.sha256}`}>
                <SongCover
                  cover={song.cover}
                  artist={song.artist}
                  title={song.title}
                />
              </Link>
              <LabelMedium color={"#ff2876"}>@{song.user}</LabelMedium>
              <LabelMedium>is listening to this song</LabelMedium>
              <LabelMedium color="#42576ca6">
                {dayjs(song.date).fromNow()}
              </LabelMedium>
            </FlexGridItem>
          ))}
        </FlexGrid>
      </div>
    </>
  );
}

export default Feed;
