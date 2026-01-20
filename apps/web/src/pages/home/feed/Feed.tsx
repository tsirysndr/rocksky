import styled from "@emotion/styled";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "baseui/avatar";
import type { BlockProps } from "baseui/block";
import { FlexGrid, FlexGridItem } from "baseui/flex-grid";
import { StatefulTooltip } from "baseui/tooltip";
import { LabelSmall } from "baseui/typography";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import ContentLoader from "react-content-loader";
import { feedGeneratorUriAtom } from "../../../atoms/feed";
import { followingFeedAtom } from "../../../atoms/followingFeed";
import Handle from "../../../components/Handle";
import SongCover from "../../../components/SongCover";
import { WS_URL } from "../../../consts";
import {
  useFeedInfiniteQuery,
  useScrobbleInfiniteQuery,
} from "../../../hooks/useFeed";
import FeedGenerators from "./FeedGenerators";
import { consola } from "consola";
import { Link } from "@tanstack/react-router";

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
  const followingFeed = useAtomValue(followingFeedAtom);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeedInfiniteQuery(feedUri, 30);
  const {
    data: scrobbleData,
    isLoading: scrobbleLoading,
    fetchNextPage: scrobbleFetchNextPage,
    hasNextPage: scrobbleHasNextPage,
    isFetchingNextPage: scrobbleIsFetchingNextPage,
  } = useScrobbleInfiniteQuery(localStorage.getItem("did")!, true, 30);

  const allSongs = followingFeed
    ? scrobbleData?.pages.flatMap((page) => page.scrobbles) || []
    : data?.pages.flatMap((page) => page.feed) || [];

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
      queryClient.setQueryData(["scrobblesChart"], message.scrobblesChart);

      await queryClient.invalidateQueries({
        queryKey: ["infiniteFeed", feedUri],
      });
      await queryClient.invalidateQueries({ queryKey: ["now-playings"] });
      // await queryClient.invalidateQueries({ queryKey: ["scrobblesChart"] });
    };

    return () => {
      if (ws) {
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
        }
        ws.close();
      }
      consola.info(">> WebSocket connection closed");
    };
  }, [queryClient, feedUri]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const currentHasNextPage = followingFeed
      ? scrobbleHasNextPage
      : hasNextPage;
    const currentIsFetchingNextPage = followingFeed
      ? scrobbleIsFetchingNextPage
      : isFetchingNextPage;

    if (
      !loadMoreRef.current ||
      !currentHasNextPage ||
      currentIsFetchingNextPage
    )
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          currentHasNextPage &&
          !currentIsFetchingNextPage
        ) {
          if (followingFeed) {
            scrobbleFetchNextPage();
          } else {
            fetchNextPage();
          }
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [
    followingFeed,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    scrobbleFetchNextPage,
    scrobbleHasNextPage,
    scrobbleIsFetchingNextPage,
  ]);

  return (
    <Container>
      <FeedGenerators />
      {(isLoading || scrobbleLoading) && (
        <ContentLoader
          width="100%"
          height={800}
          viewBox="0 0 1100 800"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
          style={{ marginTop: "-100px" }}
        >
          {/* First row - 3 items with 24px gap (scale800) */}
          <rect x="0" y="0" rx="2" ry="2" width="349" height="349" />
          <rect x="373" y="0" rx="2" ry="2" width="349" height="349" />
          <rect x="746" y="0" rx="2" ry="2" width="349" height="349" />

          {/* Second row - 3 items with 32px row gap (scale1000) */}
          <rect x="0" y="381" rx="2" ry="2" width="349" height="349" />
          <rect x="373" y="381" rx="2" ry="2" width="349" height="349" />
          <rect x="746" y="381" rx="2" ry="2" width="349" height="349" />
        </ContentLoader>
      )}

      {!isLoading && !scrobbleLoading && (
        <div className="pb-[100px] pt-[20px]">
          {followingFeed && allSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 mt-[100px]">
              <LabelSmall className="!text-[var(--color-text-muted)] text-center">
                No scrobbles from people you follow yet.
                <br />
                Start following users to see their music activity here.
              </LabelSmall>
            </div>
          ) : (
            <>
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
                        to={
                          `/${song.uri?.split("at://")[1].replace("app.rocksky.", "")}` as string
                        }
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

                      {(song?.tags || []).length > 0 && (
                        <div className="mb-[10px] flex flex-wrap gap-x-[10px] gap-y-[4px]">
                          {(song?.tags || []).map((genre: string) => (
                            <span
                              className="text-[var(--color-genre)] text-[13px]"
                              style={{ fontFamily: "RockfordSansRegular" }}
                            >
                              # {genre}
                            </span>
                          ))}
                        </div>
                      )}

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
              <div
                ref={loadMoreRef}
                style={{ height: "20px", marginTop: "20px" }}
              >
                {(followingFeed
                  ? scrobbleIsFetchingNextPage
                  : isFetchingNextPage) && (
                  <ContentLoader
                    width="100%"
                    height={360}
                    viewBox="0 0 1100 360"
                    backgroundColor="var(--color-skeleton-background)"
                    foregroundColor="var(--color-skeleton-foreground)"
                  >
                    {/* 3 items with 24px gap (scale800) */}
                    <rect x="0" y="10" rx="2" ry="2" width="349" height="349" />
                    <rect
                      x="373"
                      y="10"
                      rx="2"
                      ry="2"
                      width="349"
                      height="349"
                    />
                    <rect
                      x="746"
                      y="10"
                      rx="2"
                      ry="2"
                      width="349"
                      height="349"
                    />
                  </ContentLoader>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Container>
  );
}

export default Feed;
