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
import { useFeedInfiniteQuery } from "../../../hooks/useFeed";
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
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeedInfiniteQuery(feedUri, 30);

  const allSongs = data?.pages.flatMap((page) => page.feed) || [];

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

      await queryClient.invalidateQueries({
        queryKey: ["infiniteFeed", feedUri],
      });
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
  }, [queryClient, feedUri]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Container>
      <FeedGenerators />
      {isLoading && (
        <ContentLoader
          width="100%"
          height={800}
          viewBox="0 0 1100 800"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          {/* First row - 3 items with 24px gap (scale800) */}
          <rect x="0" y="20" rx="2" ry="2" width="349" height="349" />
          <rect x="373" y="20" rx="2" ry="2" width="349" height="349" />
          <rect x="746" y="20" rx="2" ry="2" width="349" height="349" />

          {/* Second row - 3 items with 32px row gap (scale1000) */}
          <rect x="0" y="401" rx="2" ry="2" width="349" height="349" />
          <rect x="373" y="401" rx="2" ry="2" width="349" height="349" />
          <rect x="746" y="401" rx="2" ry="2" width="349" height="349" />
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
              allSongs.map((song: any) => (
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
                      uri={song.trackUri}
                      cover={song.cover}
                      artist={song.artist}
                      title={song.title}
                      liked={song.liked}
                      likesCount={song.likesCount}
                      withLikeButton
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

          {/* Load more trigger */}
          <div ref={loadMoreRef} style={{ height: "20px", marginTop: "20px" }}>
            {isFetchingNextPage && (
              <ContentLoader
                width="100%"
                height={360}
                viewBox="0 0 1100 360"
                backgroundColor="var(--color-skeleton-background)"
                foregroundColor="var(--color-skeleton-foreground)"
              >
                {/* 3 items with 24px gap (scale800) */}
                <rect x="0" y="10" rx="2" ry="2" width="349" height="349" />
                <rect x="373" y="10" rx="2" ry="2" width="349" height="349" />
                <rect x="746" y="10" rx="2" ry="2" width="349" height="349" />
              </ContentLoader>
            )}
          </div>
        </div>
      )}
    </Container>
  );
}

export default Feed;
