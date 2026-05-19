import { Avatar } from "baseui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import ContentLoader from "react-content-loader";
import { Link } from "react-router-dom";
import { feedGeneratorUriAtom, followingFeedAtom } from "../../../atoms/feed";
import { IconUser } from "@tabler/icons-react";
import {
  useFeedInfiniteQuery,
  useScrobbleInfiniteQuery,
} from "../../../hooks/useFeed";
import { WS_URL } from "../../../consts";
import FeedGenerators from "../../../components/FeedGenerators";
import Stories from "../../../components/Stories";
import Heart from "../../../components/Icons/Heart";
import HeartOutline from "../../../components/Icons/HeartOutline";
import useLike from "../../../hooks/useLike";
import SignInModal from "../../../components/SignInModal";

dayjs.extend(relativeTime);

function SongCard({ song }: { song: Record<string, unknown> }) {
  const songUri = song.uri as string;
  const cover = song.cover as string;
  const title = song.title as string;
  const artist = song.artist as string;
  const user = song.user as string;
  const userDisplayName = song.userDisplayName as string;
  const userAvatar = song.userAvatar as string;
  const date = song.date as string;
  const tags = (song.tags as string[]) || [];
  const [liked, setLiked] = useState(!!song.liked);
  const [likesCount, setLikesCount] = useState((song.likesCount as number) || 0);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const { like, unlike } = useLike();

  const href = songUri
    ? `/${songUri.split("at://")[1].replace("app.rocksky.", "")}`
    : null;

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!localStorage.getItem("token")) {
      setIsSignInOpen(true);
      return;
    }
    if (liked) {
      setLiked(false);
      setLikesCount((c) => Math.max(0, c - 1));
      unlike(songUri);
    } else {
      setLiked(true);
      setLikesCount((c) => c + 1);
      like(songUri);
    }
  };

  const coverContent = cover ? (
    <img src={cover} alt={title} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <span className="text-5xl opacity-20">♪</span>
    </div>
  );

  const heartOverlay = (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-end p-2"
      style={{
        height: "60px",
        background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)",
        pointerEvents: "none",
      }}
    >
      <button
        onClick={handleLike}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: "3px",
          pointerEvents: "all",
        }}
      >
        {liked ? <Heart color="#fff" size={18} /> : <HeartOutline color="#fff" size={18} />}
        {likesCount > 0 && (
          <span style={{ color: "#fff", fontSize: "11px", lineHeight: 1 }}>{likesCount}</span>
        )}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col">
      {href ? (
        <Link to={href} className="no-underline block">
          <div
            className="relative w-full aspect-square rounded-xl overflow-hidden mb-2"
            style={{ backgroundColor: "var(--color-surface-2)" }}
          >
            {coverContent}
            {heartOverlay}
          </div>
          <p className="font-semibold text-sm m-0 mb-0.5 truncate" style={{ color: "var(--color-text)" }}>{title}</p>
          <p className="text-xs m-0 truncate" style={{ color: "var(--color-text-muted)" }}>{artist}</p>
        </Link>
      ) : (
        <>
          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-2" style={{ backgroundColor: "var(--color-surface-2)" }}>
            {coverContent}
            {heartOverlay}
          </div>
          <p className="font-semibold text-sm m-0 mb-0.5 truncate" style={{ color: "var(--color-text)" }}>{title}</p>
          <p className="text-xs m-0 truncate" style={{ color: "var(--color-text-muted)" }}>{artist}</p>
        </>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {tags.slice(0, 2).map((genre) => (
            <Link key={genre} to={`/genre/${genre}`} className="text-[10px] no-underline" style={{ color: "var(--color-genre)" }}>
              #{genre}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-1.5">
        {userAvatar && !userAvatar.endsWith("/@jpeg") ? (
          <Avatar src={userAvatar} name={userDisplayName} size="14px" />
        ) : (
          <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-avatar-background)" }}>
            <IconUser size={7} color="#fff" />
          </div>
        )}
        <Link to={`/profile/${user}`} className="text-[10px] no-underline truncate" style={{ color: "var(--color-primary)" }}>
          {userDisplayName || user}
        </Link>
        <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-muted)" }}>
          · {dayjs(date).fromNow()}
        </span>
      </div>
      <SignInModal isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 pt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <ContentLoader
          key={i}
          width="100%"
          height={200}
          viewBox="0 0 180 200"
          backgroundColor="var(--color-skeleton-background)"
          foregroundColor="var(--color-skeleton-foreground)"
        >
          <rect x="0" y="0" rx="12" ry="12" width="180" height="140" />
          <rect x="0" y="152" rx="4" ry="4" width="130" height="12" />
          <rect x="0" y="172" rx="4" ry="4" width="90" height="10" />
        </ContentLoader>
      ))}
    </div>
  );
}

export default function Feed() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const feedUri = useAtomValue(feedGeneratorUriAtom);
  const followingFeed = useAtomValue(followingFeedAtom);
  const did = localStorage.getItem("did") || "";

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFeedInfiniteQuery(feedUri, 20);

  const {
    data: scrobbleData,
    isLoading: scrobbleLoading,
    fetchNextPage: scrobbleFetchNextPage,
    hasNextPage: scrobbleHasNextPage,
    isFetchingNextPage: scrobbleIsFetchingNextPage,
  } = useScrobbleInfiniteQuery(did, true, 20);

  const allSongs = followingFeed
    ? scrobbleData?.pages.flatMap((p) => p.scrobbles) || []
    : data?.pages.flatMap((p) => p.feed) || [];

  // Real-time feed updates via WebSocket
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL.replace("http", "ws")}`);
    socketRef.current = ws;
    ws.onopen = () => {
      heartbeatRef.current = window.setInterval(() => ws.send("ping"), 3000);
    };
    ws.onmessage = async (event) => {
      if (event.data === "pong") return;
      await queryClient.invalidateQueries({ queryKey: ["infiniteFeed", feedUri] });
    };
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      ws.close();
    };
  }, [queryClient, feedUri]);

  // Infinite scroll
  useEffect(() => {
    const currentHasNext = followingFeed ? scrobbleHasNextPage : hasNextPage;
    const currentFetching = followingFeed ? scrobbleIsFetchingNextPage : isFetchingNextPage;
    if (!loadMoreRef.current || !currentHasNext || currentFetching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && currentHasNext && !currentFetching) {
          followingFeed ? scrobbleFetchNextPage() : fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [followingFeed, fetchNextPage, hasNextPage, isFetchingNextPage, scrobbleFetchNextPage, scrobbleHasNextPage, scrobbleIsFetchingNextPage]);

  const loading = isLoading || scrobbleLoading;

  return (
    <div>
      <Stories />
      <FeedGenerators />

      {loading && <FeedSkeleton />}

      {!loading && allSongs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
          <span className="text-6xl mb-4 opacity-20">♪</span>
          <p className="text-sm m-0" style={{ color: "var(--color-text-muted)" }}>
            {followingFeed
              ? "No scrobbles from people you follow yet. Start following users!"
              : "No songs in feed yet."}
          </p>
        </div>
      )}

      {!loading && allSongs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {allSongs.map((song: any, i: number) => (
            <SongCard key={song.id || song.uri || i} song={song} />
          ))}
        </div>
      )}

      <div ref={loadMoreRef} className="h-10 flex items-center justify-center mt-2">
        {(followingFeed ? scrobbleIsFetchingNextPage : isFetchingNextPage) && (
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }}
          />
        )}
      </div>
    </div>
  );
}
