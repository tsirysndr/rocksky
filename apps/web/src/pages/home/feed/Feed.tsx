import styled from "@emotion/styled";
import { Link } from "@tanstack/react-router";
import { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { StatefulTooltip } from "baseui/tooltip";
import { HeadingMedium, LabelMedium } from "baseui/typography";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import ContentLoader from "react-content-loader";
import Handle from "../../../components/Handle";
import SongCover from "../../../components/SongCover";
import { useFeedQuery } from "../../../hooks/useFeed";

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
  const { data, isLoading } = useFeedQuery();
  return (
    <Container>
      <HeadingMedium
        marginTop={"0px"}
        marginBottom={"20px"}
        className="!text-[var(--color-text)]"
      >
        Recently played
      </HeadingMedium>

      {isLoading && (
        <ContentLoader
          width={800}
          height={575}
          viewBox="0 0 800 575"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          <rect x="12" y="9" rx="2" ry="2" width="140" height="10" />
          <rect x="14" y="30" rx="2" ry="2" width="667" height="11" />
          <rect x="12" y="58" rx="2" ry="2" width="211" height="211" />
          <rect x="240" y="57" rx="2" ry="2" width="211" height="211" />
          <rect x="467" y="56" rx="2" ry="2" width="211" height="211" />
          <rect x="12" y="283" rx="2" ry="2" width="211" height="211" />
          <rect x="240" y="281" rx="2" ry="2" width="211" height="211" />
          <rect x="468" y="279" rx="2" ry="2" width="211" height="211" />
          <circle cx="286" cy="536" r="12" />
          <circle cx="319" cy="535" r="12" />
          <circle cx="353" cy="535" r="12" />
          <rect x="378" y="524" rx="0" ry="0" width="52" height="24" />
          <rect x="210" y="523" rx="0" ry="0" width="52" height="24" />
          <circle cx="210" cy="535" r="12" />
          <circle cx="428" cy="536" r="12" />
        </ContentLoader>
      )}

      {!isLoading && (
        <div className="pb-[100px]">
          <FlexGrid
            flexGridColumnCount={[1, 2, 3]}
            flexGridColumnGap="scale800"
            flexGridRowGap="scale800"
          >
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data.map((song: any) => (
                <FlexGridItem {...itemProps} key={song.id}>
                  <Link
                    to="/$did/scrobble/$rkey"
                    params={{
                      did: song.uri?.split("at://")[1]?.split("/")[0] || "",
                      rkey: song.uri?.split("/").pop() || "",
                    }}
                  >
                    <SongCover
                      cover={song.cover}
                      artist={song.artist}
                      title={song.title}
                    />
                  </Link>
                  <Handle link={`/profile/${song.user}`} did={song.user} />{" "}
                  <LabelMedium className="!text-[var(--color-text-primary)]">
                    recently played this song
                  </LabelMedium>
                  <StatefulTooltip
                    content={dayjs(song.date).format(
                      "MMMM D, YYYY [at] HH:mm A",
                    )}
                    returnFocus
                    autoFocus
                  >
                    <LabelMedium className="!text-[var(--color-text-muted)]">
                      {dayjs(song.date).fromNow()}
                    </LabelMedium>
                  </StatefulTooltip>
                </FlexGridItem>
              ))
            }
          </FlexGrid>
        </div>
      )}
    </Container>
  );
}

export default Feed;
