import styled from "@emotion/styled";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingMedium, LabelMedium } from "baseui/typography";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Link } from "react-router";
import SongCover from "../../../components/SongCover";
import useFeed from "../../../hooks/useFeed";

dayjs.extend(relativeTime);

const Container = styled.div`
  width: 100%;
`;

function Feed() {
  const { getFeed } = useFeed();
  const data = getFeed();
  return (
    <Container>
      <HeadingMedium
        marginTop={"50px"}
        marginBottom={"20px"}
        paddingLeft={"15px"}
        paddingRight={"15px"}
      >
        Recently played
      </HeadingMedium>
      {data.length === 0 && <div style={{ width: "100vw", height: 50 }}></div>}

      {data.length > 0 && (
        <div style={{ paddingBottom: 100 }}>
          <div>
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data.map((song: any) => (
                <div key={song.id} style={{ marginBottom: 50 }}>
                  <Link to={`/${song.uri.split("at://")[1]}`}>
                    <SongCover
                      cover={song.cover}
                      artist={song.artist}
                      title={song.title}
                      maxWidth
                    />
                  </Link>
                  <div style={{ padding: "0 15px" }}>
                    <Link
                      to={`/profile/${song.user}`}
                      style={{ textDecoration: "none" }}
                    >
                      <LabelMedium color={"#ff2876"}>@{song.user}</LabelMedium>
                    </Link>
                    <LabelMedium>is listening to this song</LabelMedium>
                    <StatefulTooltip
                      content={dayjs(song.date).format(
                        "MMMM D, YYYY [at] HH:mm A"
                      )}
                      returnFocus
                      autoFocus
                    >
                      <LabelMedium color="#42576ca6">
                        {dayjs(song.date).fromNow()}
                      </LabelMedium>
                    </StatefulTooltip>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </Container>
  );
}

export default Feed;
