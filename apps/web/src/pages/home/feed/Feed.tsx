import styled from "@emotion/styled";
import { Link } from "@tanstack/react-router";
import { Avatar } from "baseui/avatar";
import type { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { StatefulTooltip } from "baseui/tooltip";
import { LabelSmall } from "baseui/typography";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import ContentLoader from "react-content-loader";
import Handle from "../../../components/Handle";
import SongCover from "../../../components/SongCover";
import { useFeedQuery } from "../../../hooks/useFeed";
import { useEffect, useRef } from "react";
import { WS_URL } from "../../../consts";
import { useQueryClient } from "@tanstack/react-query";
import FeedGenerators from "./FeedGenerators";
import { useAtomValue } from "jotai";
import { feedGeneratorUriAtom } from "../../../atoms/feed";

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
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatInterval = useRef<number | null>(null);
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const { data, isLoading } = useFeedQuery(feedUri);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL.replace("http", "ws")}`);
    socketRef.current = ws;

    ws.onopen = () => {
      heartbeatInterval.current = window.setInterval(() => {
        ws.send("ping");
      }, 3000);
    };

    ws.onmessage = async (event) => {
      if (event.data === "pong") {
        return;
      }

      const message = JSON.parse(event.data);
      queryClient.setQueryData(["now-playings"], () => message.nowPlayings);
      queryClient.setQueryData(
        ["scrobblesChart"],
        () => message.scrobblesChart,
      );

      await queryClient.invalidateQueries({ queryKey: ["feed"] });
      await queryClient.invalidateQueries({ queryKey: ["now-playings"] });
      await queryClient.invalidateQueries({ queryKey: ["scrobblesChart"] });
    };

    return () => {
      if (ws) {
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
        }
        ws.close();
      }
      console.log(">> WebSocket connection closed");
    };
  }, [queryClient]);

  return (
    <Container>
      <FeedGenerators />
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
        <div className="pb-[100px] pt-[20px]">
          <FlexGrid
            flexGridColumnCount={[1, 2, 3]}
            flexGridColumnGap="scale800"
            flexGridRowGap="scale1000"
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
                    className="no-underline text-[var(--color-text-primary)]"
                  >
                    <SongCover
                      cover={song.cover}
                      artist={song.artist}
                      title={song.title}
                    />
                  </Link>
                  <div className="flex">
                    <div className="mr-[8px]">
                      <Avatar
                        src={song.userAvatar}
                        name={song.userDisplayName}
                        size={"20px"}
                      />
                    </div>
                    <Handle
                      link={`/profile/${song.user}`}
                      did={song.user}
                    />{" "}
                  </div>
                  <LabelSmall className="!text-[var(--color-text-primary)]">
                    recently played this song
                  </LabelSmall>
                  <StatefulTooltip
                    content={dayjs(song.date).format(
                      "MMMM D, YYYY [at] HH:mm A",
                    )}
                    returnFocus
                    autoFocus
                  >
                    <LabelSmall className="!text-[var(--color-text-muted)]">
                      {dayjs(song.date).fromNow()}
                    </LabelSmall>
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
