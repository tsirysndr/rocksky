import {
  IconCheck,
  IconHeart,
  IconPlus,
  IconUser,
} from "@tabler/icons-react";
import { Avatar } from "baseui/avatar";
import ContentLoader from "react-content-loader";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import numeral from "numeral";
import { followsAtom } from "../../atoms/follows";
import Main from "../../layouts/Main";
import {
  useFollowAccountMutation,
  useFollowersInfiniteQuery,
  useFollowersQuery,
  useFollowsInfiniteQuery,
  useFollowsQuery,
  useUnfollowAccountMutation,
} from "../../hooks/useGraph";
import {
  useProfileByDidQuery,
  useProfileStatsByDidQuery,
  useRecentTracksByDidQuery,
  useActorNeighboursQuery,
} from "../../hooks/useProfile";
import {
  useArtistsQuery,
  useAlbumsQuery,
  useTracksQuery,
  useLovedTracksQuery,
} from "../../hooks/useLibrary";
import ShareOnBluesky from "../../components/ShareOnBluesky";
import FloatingShoutBar from "../../components/FloatingShoutBar";
import { ALL_TIME, LAST_7_DAYS, RANGE_LABELS, RANGE_OPTIONS } from "../../consts";
import { getLastDays } from "../../lib/date";

dayjs.extend(relativeTime);

// ─── helpers ─────────────────────────────────────────────────────────────────

function toPath(uri?: string) {
  if (!uri) return null;
  return `/${uri.split("at://")[1].replace("app.rocksky.", "")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function img(track: any): string {
  return track.cover || track.album_art || track.albumArt || "";
}

// ─── shared user card ─────────────────────────────────────────────────────────

function UserCard({ user }: { user: Record<string, string> }) {
  const currentDid = localStorage.getItem("did");
  const [follows, setFollows] = useAtom(followsAtom);
  const { mutate: follow } = useFollowAccountMutation();
  const { mutate: unfollow } = useUnfollowAccountMutation();
  const isFollowing = follows.has(user.did);
  const isMe = user.did === currentDid;

  const onFollow = () => {
    setFollows((p) => new Set(p).add(user.did));
    follow(user.did);
  };
  const onUnfollow = () => {
    setFollows((p) => { const n = new Set(p); n.delete(user.did); return n; });
    unfollow(user.did);
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
      <Link to={`/profile/${user.did}`} className="no-underline shrink-0">
        {user.avatar && !user.avatar.endsWith("/@jpeg") ? (
          <Avatar src={user.avatar} name={user.displayName} size="48px" />
        ) : (
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--color-avatar-background)" }}>
            <IconUser size={22} color="#fff" />
          </div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <Link to={`/profile/${user.did}`} className="no-underline block font-semibold text-sm truncate" style={{ color: "var(--color-text)" }}>
          {user.displayName || user.handle}
        </Link>
        <Link to={`/profile/${user.did}`} className="no-underline text-xs truncate block" style={{ color: "var(--color-primary)" }}>
          @{user.handle}
        </Link>
      </div>
      {!isMe && currentDid && (
        <button
          onClick={isFollowing ? onUnfollow : onFollow}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer shrink-0"
          style={{
            backgroundColor: isFollowing ? "var(--color-surface-2)" : "var(--color-primary)",
            color: isFollowing ? "var(--color-text)" : "#fff",
          }}
        >
          {isFollowing ? <IconCheck size={13} /> : <IconPlus size={13} />}
          {isFollowing ? "Following" : "Follow"}
        </button>
      )}
    </div>
  );
}

// ─── infinite-scroll user list ───────────────────────────────────────────────

function InfiniteUserList({ pages, fetchNextPage, hasNextPage, isFetchingNextPage, emptyText }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pages: any[] | undefined;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  emptyText: string;
}) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const users: any[] = pages?.flatMap((p) => p.followers ?? p.follows ?? []) ?? [];

  // Sync follow status
  const [, setFollows] = useAtom(followsAtom);
  const currentDid = localStorage.getItem("did") || "";
  const dids = users.map((u) => u.did).filter((d) => d !== currentDid);
  const { data: followsData } = useFollowsQuery(currentDid, dids.length, dids);

  useEffect(() => {
    if (!followsData?.follows) return;
    setFollows((prev) => {
      const next = new Set(prev);
      followsData.follows.forEach((f: { did: string }) => next.add(f.did));
      return next;
    });
  }, [followsData, setFollows]);

  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) fetchNextPage(); }, { threshold: 0.1 });
    obs.observe(loadMoreRef.current);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (users.length === 0 && pages) {
    return <p className="text-sm text-center py-12" style={{ color: "var(--color-text-muted)" }}>{emptyText}</p>;
  }

  return (
    <div>
      {users.map((u) => <UserCard key={u.did} user={u} />)}
      <div ref={loadMoreRef} className="h-8 flex items-center justify-center">
        {isFetchingNextPage && (
          <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
        )}
      </div>
    </div>
  );
}

// ─── time range sheet ─────────────────────────────────────────────────────────

function TimeRangeSheet({ open, selected, onSelect, onClose }: {
  open: boolean;
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl px-4 pt-3 pb-10"
        style={{ backgroundColor: "var(--color-background)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: "var(--color-border)" }} />
        <h3 className="text-sm font-semibold mb-2 px-1" style={{ color: "var(--color-text)" }}>Time Range</h3>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => { onSelect(opt.id); onClose(); }}
            className="w-full text-left px-3 py-3 rounded-xl text-sm flex items-center justify-between border-none cursor-pointer"
            style={{
              backgroundColor: selected === opt.id ? "var(--color-surface-2)" : "transparent",
              color: selected === opt.id ? "var(--color-primary)" : "var(--color-text)",
            }}
          >
            {opt.label}
            {selected === opt.id && <span style={{ color: "var(--color-primary)" }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function rangeToDateParams(rangeKey: string): [Date, Date] | [] {
  const opt = RANGE_OPTIONS.find((o) => o.id === rangeKey);
  if (!opt || opt.days === null) return [];
  return getLastDays(opt.days);
}

// ─── overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ did }: { did: string }) {
  const [rangeKey, setRangeKey] = useState(LAST_7_DAYS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const dateParams = rangeToDateParams(rangeKey);
  const [startDate, endDate] = dateParams as [Date | undefined, Date | undefined];

  const { data: recentTracks } = useRecentTracksByDidQuery(did, 0, 20);
  const { data: artists } = useArtistsQuery(did, 0, 5, startDate, endDate);
  const { data: albums } = useAlbumsQuery(did, 0, 6, startDate, endDate);
  const { data: tracks } = useTracksQuery(did, 0, 10, startDate, endDate);

  // Fallback to all-time when 7-day default yields no results
  const { data: allArtists } = useArtistsQuery(did, 0, 5);
  const { data: allAlbums } = useAlbumsQuery(did, 0, 6);
  const { data: allTracks } = useTracksQuery(did, 0, 10);

  const isDefault7Days = rangeKey === LAST_7_DAYS;

  const rawArtists = Array.isArray(artists) ? artists : [];
  const rawAlbums = Array.isArray(albums) ? albums : [];
  const rawTracks = Array.isArray(tracks) ? tracks : [];

  const allArtistList = Array.isArray(allArtists) ? allArtists : [];
  const allAlbumList = Array.isArray(allAlbums) ? allAlbums : [];
  const allTrackList = Array.isArray(allTracks) ? allTracks : [];

  // Auto-switch to all-time if 7-day default has no data
  useEffect(() => {
    if (
      isDefault7Days &&
      rawArtists.length === 0 &&
      rawAlbums.length === 0 &&
      rawTracks.length === 0 &&
      (allArtistList.length > 0 || allAlbumList.length > 0 || allTrackList.length > 0)
    ) {
      setRangeKey(ALL_TIME);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDefault7Days, rawArtists.length, rawAlbums.length, rawTracks.length, allArtistList.length, allAlbumList.length, allTrackList.length]);

  const artistList = rawArtists;
  const albumList = rawAlbums;
  const trackList = rawTracks;

  return (
    <>
    <TimeRangeSheet
      open={sheetOpen}
      selected={rangeKey}
      onSelect={setRangeKey}
      onClose={() => setSheetOpen(false)}
    />
    <div>
      {/* Recent Listens */}
      <section className="mb-6">
        <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Recent Listens</h3>
        {(recentTracks || []).length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }}>No recent listens</p>
        )}
        {(recentTracks || []).map((track: Record<string, unknown>, i: number) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cover = img(track);
          const title = track.title as string;
          const artist = ((track as any).artist || (track as any).album_artist) as string;
          const uri = ((track as any).uri || (track as any).song_uri) as string;
          const date = ((track as any).created_at || (track as any).date || (track as any).createdAt) as string;
          const href = toPath(uri);
          return (
            <div key={String(track.id || i)} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
                {cover ? <img src={cover} alt={title} className="w-full h-full object-cover" /> : (
                  <div className="w-full h-full flex items-center justify-center"><span className="text-lg opacity-20">♪</span></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {href ? (
                  <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>{title}</Link>
                ) : (
                  <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{title}</p>
                )}
                <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{artist}</p>
              </div>
              {date && <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-muted)" }}>{dayjs(date).fromNow()}</span>}
            </div>
          );
        })}
      </section>

      {/* Time range selector */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Top Charts</span>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border-none cursor-pointer"
          style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-text)" }}
        >
          {RANGE_LABELS[rangeKey]}
          <span className="opacity-50">▾</span>
        </button>
      </div>

      {/* Top Artists */}
      {artistList.length > 0 && (
        <section className="mb-6">
          <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Top Artists</h3>
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {artistList.map((a: any) => {
              const href = toPath(a.uri);
              return (
                <div key={a.id || a.uri} className="flex flex-col items-center shrink-0" style={{ width: 72 }}>
                  {href ? (
                    <Link to={href} className="no-underline flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full overflow-hidden mb-1" style={{ backgroundColor: "var(--color-surface-2)" }}>
                        {(a.picture || a.photo) ? <img src={a.picture || a.photo} alt={a.name} className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full flex items-center justify-center"><span className="text-2xl opacity-20">♬</span></div>
                        )}
                      </div>
                      <span className="text-[11px] text-center truncate w-full" style={{ color: "var(--color-text)" }}>{a.name}</span>
                      <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{numeral(a.playCount || a.scrobbles).format("0,0")}</span>
                    </Link>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full overflow-hidden mb-1" style={{ backgroundColor: "var(--color-surface-2)" }}>
                        <div className="w-full h-full flex items-center justify-center"><span className="text-2xl opacity-20">♬</span></div>
                      </div>
                      <span className="text-[11px] text-center truncate w-full" style={{ color: "var(--color-text)" }}>{a.name}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top Albums */}
      {albumList.length > 0 && (
        <section className="mb-6">
          <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Top Albums</h3>
          <div className="grid grid-cols-3 gap-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {albumList.map((a: any) => {
              const href = toPath(a.uri);
              const art = a.albumArt || a.album_art;
              return (
                <div key={a.id || a.uri}>
                  {href ? (
                    <Link to={href} className="no-underline block">
                      <div className="aspect-square rounded-xl overflow-hidden mb-1" style={{ backgroundColor: "var(--color-surface-2)" }}>
                        {art ? <img src={art} alt={a.title} className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full flex items-center justify-center"><span className="text-2xl opacity-20">💿</span></div>
                        )}
                      </div>
                      <p className="text-[11px] m-0 truncate font-medium" style={{ color: "var(--color-text)" }}>{a.title}</p>
                    </Link>
                  ) : (
                    <>
                      <div className="aspect-square rounded-xl overflow-hidden mb-1" style={{ backgroundColor: "var(--color-surface-2)" }}>
                        <div className="w-full h-full flex items-center justify-center"><span className="text-2xl opacity-20">💿</span></div>
                      </div>
                      <p className="text-[11px] m-0 truncate font-medium" style={{ color: "var(--color-text)" }}>{a.title}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top Tracks */}
      {trackList.length > 0 && (
        <section className="mb-6">
          <h3 className="font-semibold text-sm mb-3 uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Top Tracks</h3>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {trackList.map((t: any, i: number) => {
            const href = toPath(t.uri);
            const art = t.albumArt || t.album_art;
            return (
              <div key={t.id || t.uri || i} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-xs w-5 text-center opacity-40 shrink-0" style={{ color: "var(--color-text)" }}>{i + 1}</span>
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
                  {art ? <img src={art} alt={t.title} className="w-full h-full object-cover" /> : (
                    <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {href ? (
                    <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>{t.title}</Link>
                  ) : (
                    <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{t.title}</p>
                  )}
                  <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{t.artist || t.albumArtist || t.album_artist}</p>
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>
                  {numeral(t.playCount || t.scrobbles).format("0,0")}
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
    </>
  );
}

// ─── library ──────────────────────────────────────────────────────────────────

const LIBRARY_TABS = ["Scrobbles", "Artists", "Albums", "Tracks"];
const SCROBBLE_PAGE = 30;
const ARTIST_PAGE = 50;
const ALBUM_PAGE = 50;
const TRACK_PAGE = 50;

function Pager({ page, totalPages, onPrev, onNext }: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-4 pb-2">
      <button
        onClick={onPrev}
        disabled={page === 1}
        className="px-4 py-2 text-sm rounded-full border-none cursor-pointer disabled:opacity-30"
        style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-text)" }}
      >
        ← Prev
      </button>
      <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        Page {page}{totalPages > 1 ? ` / ${totalPages}` : ""}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="px-4 py-2 text-sm rounded-full border-none cursor-pointer disabled:opacity-30"
        style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-text)" }}
      >
        Next →
      </button>
    </div>
  );
}

function LibraryTab({ did }: { did: string }) {
  const [sub, setSub] = useState(0);
  const [scrobblePage, setScrobblePage] = useState(1);
  const [artistPage, setArtistPage] = useState(1);
  const [albumPage, setAlbumPage] = useState(1);
  const [trackPage, setTrackPage] = useState(1);

  const { data: stats } = useProfileStatsByDidQuery(did);

  const { data: scrobbles } = useRecentTracksByDidQuery(did, (scrobblePage - 1) * SCROBBLE_PAGE, SCROBBLE_PAGE);
  const { data: artists } = useArtistsQuery(did, (artistPage - 1) * ARTIST_PAGE, ARTIST_PAGE);
  const { data: albums } = useAlbumsQuery(did, (albumPage - 1) * ALBUM_PAGE, ALBUM_PAGE);
  const { data: tracks } = useTracksQuery(did, (trackPage - 1) * TRACK_PAGE, TRACK_PAGE);

  const artistList: unknown[] = Array.isArray(artists) ? artists : [];
  const albumList: unknown[] = Array.isArray(albums) ? albums : [];
  const trackList: unknown[] = Array.isArray(tracks) ? tracks : [];
  const scrobbleList: Record<string, unknown>[] = scrobbles || [];

  const scrobbleTotalPages = stats?.scrobbles ? Math.ceil(stats.scrobbles / SCROBBLE_PAGE) : Math.max(1, Math.ceil(scrobbleList.length / SCROBBLE_PAGE) + (scrobbleList.length >= SCROBBLE_PAGE ? 1 : 0));
  const artistTotalPages = stats?.artists ? Math.ceil(stats.artists / ARTIST_PAGE) : Math.max(1, artistList.length >= ARTIST_PAGE ? artistPage + 1 : artistPage);
  const albumTotalPages = stats?.albums ? Math.ceil(stats.albums / ALBUM_PAGE) : Math.max(1, albumList.length >= ALBUM_PAGE ? albumPage + 1 : albumPage);
  const trackTotalPages = trackList.length >= TRACK_PAGE ? trackPage + 1 : Math.max(1, trackPage);

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {LIBRARY_TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setSub(i)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border-none cursor-pointer"
            style={{
              backgroundColor: sub === i ? "var(--color-primary)" : "var(--color-surface-2)",
              color: sub === i ? "#fff" : "var(--color-text-muted)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Scrobbles */}
      {sub === 0 && (
        <div>
          {scrobbleList.map((t, i) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cover = img(t);
            const title = t.title as string;
            const artist = ((t as any).artist || (t as any).album_artist) as string;
            const uri = ((t as any).uri || (t as any).song_uri) as string;
            const date = ((t as any).created_at || (t as any).date || (t as any).createdAt) as string;
            const href = toPath(uri);
            return (
              <div key={String(t.id || i)} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
                  {cover ? <img src={cover} alt={title} className="w-full h-full object-cover" /> : (
                    <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {href ? (
                    <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>{title}</Link>
                  ) : (
                    <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{title}</p>
                  )}
                  <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{artist}</p>
                </div>
                {date && <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-muted)" }}>{dayjs(date).fromNow()}</span>}
              </div>
            );
          })}
          {scrobbleList.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>No scrobbles yet</p>}
          <Pager page={scrobblePage} totalPages={scrobbleTotalPages} onPrev={() => setScrobblePage((p) => Math.max(1, p - 1))} onNext={() => setScrobblePage((p) => p + 1)} />
        </div>
      )}

      {/* Artists */}
      {sub === 1 && (
        <div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {artistList.map((a: any, i: number) => {
            const href = toPath(a.uri);
            return (
              <div key={a.id || a.uri || i} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-xs w-6 text-center opacity-40 shrink-0" style={{ color: "var(--color-text)" }}>{(artistPage - 1) * ARTIST_PAGE + i + 1}</span>
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
                  {(a.picture || a.photo) ? <img src={a.picture || a.photo} alt={a.name} className="w-full h-full object-cover" /> : (
                    <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♬</span></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {href ? (
                    <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>{a.name}</Link>
                  ) : (
                    <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{a.name}</p>
                  )}
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>{numeral(a.playCount || a.scrobbles).format("0,0")}</span>
              </div>
            );
          })}
          {artistList.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>No artists yet</p>}
          <Pager page={artistPage} totalPages={artistTotalPages} onPrev={() => setArtistPage((p) => Math.max(1, p - 1))} onNext={() => setArtistPage((p) => p + 1)} />
        </div>
      )}

      {/* Albums */}
      {sub === 2 && (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {albumList.map((a: any, i: number) => {
              const href = toPath(a.uri);
              const art = a.albumArt || a.album_art;
              return (
                <div key={a.id || a.uri || i}>
                  {href ? (
                    <Link to={href} className="no-underline block">
                      <div className="aspect-square rounded-xl overflow-hidden mb-1" style={{ backgroundColor: "var(--color-surface-2)" }}>
                        {art ? <img src={art} alt={a.title} className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full flex items-center justify-center"><span className="text-xl opacity-20">💿</span></div>
                        )}
                      </div>
                      <p className="text-[11px] m-0 truncate font-medium" style={{ color: "var(--color-text)" }}>{a.title}</p>
                      <p className="text-[10px] m-0 truncate" style={{ color: "var(--color-text-muted)" }}>{numeral(a.playCount || a.scrobbles).format("0,0")} plays</p>
                    </Link>
                  ) : (
                    <>
                      <div className="aspect-square rounded-xl overflow-hidden mb-1" style={{ backgroundColor: "var(--color-surface-2)" }}>
                        <div className="w-full h-full flex items-center justify-center"><span className="text-xl opacity-20">💿</span></div>
                      </div>
                      <p className="text-[11px] m-0 truncate font-medium" style={{ color: "var(--color-text)" }}>{a.title}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {albumList.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>No albums yet</p>}
          <Pager page={albumPage} totalPages={albumTotalPages} onPrev={() => setAlbumPage((p) => Math.max(1, p - 1))} onNext={() => setAlbumPage((p) => p + 1)} />
        </div>
      )}

      {/* Tracks */}
      {sub === 3 && (
        <div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {trackList.map((t: any, i: number) => {
            const href = toPath(t.uri);
            const art = t.albumArt || t.album_art;
            return (
              <div key={t.id || t.uri || i} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-xs w-6 text-center opacity-40 shrink-0" style={{ color: "var(--color-text)" }}>{(trackPage - 1) * TRACK_PAGE + i + 1}</span>
                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
                  {art ? <img src={art} alt={t.title} className="w-full h-full object-cover" /> : (
                    <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {href ? (
                    <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>{t.title}</Link>
                  ) : (
                    <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{t.title}</p>
                  )}
                  <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{t.artist || t.albumArtist || t.album_artist}</p>
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--color-text-muted)" }}>{numeral(t.playCount || t.scrobbles).format("0,0")}</span>
              </div>
            );
          })}
          {trackList.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>No tracks yet</p>}
          <Pager page={trackPage} totalPages={trackTotalPages} onPrev={() => setTrackPage((p) => Math.max(1, p - 1))} onNext={() => setTrackPage((p) => p + 1)} />
        </div>
      )}
    </div>
  );
}

// ─── followers ────────────────────────────────────────────────────────────────

function FollowersTab({ did }: { did: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useFollowersInfiniteQuery(did, 20);
  const count = data?.pages?.[0]?.count;
  return (
    <div>
      {count > 0 && <p className="text-sm mb-3" style={{ color: "var(--color-text-muted)" }}>{numeral(count).format("0,0")} followers</p>}
      <InfiniteUserList
        pages={data?.pages}
        fetchNextPage={fetchNextPage}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        emptyText="No followers yet"
      />
    </div>
  );
}

// ─── following ────────────────────────────────────────────────────────────────

function FollowingTab({ did }: { did: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useFollowsInfiniteQuery(did, 20);
  const count = data?.pages?.[0]?.count;
  return (
    <div>
      {count > 0 && <p className="text-sm mb-3" style={{ color: "var(--color-text-muted)" }}>{numeral(count).format("0,0")} following</p>}
      <InfiniteUserList
        pages={data?.pages}
        fetchNextPage={fetchNextPage}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        emptyText="Not following anyone yet"
      />
    </div>
  );
}

// ─── circles ─────────────────────────────────────────────────────────────────

function CirclesTab({ did, handle }: { did: string; handle: string }) {
  const { data, isLoading } = useActorNeighboursQuery(did);
  const [follows, setFollows] = useAtom(followsAtom);
  const { mutate: follow } = useFollowAccountMutation();
  const { mutate: unfollow } = useUnfollowAccountMutation();
  const currentDid = localStorage.getItem("did") || "";

  const neighbours = data?.neighbours ?? [];
  const dids = neighbours.map((n: Record<string, string>) => n.did).filter((d: string) => d !== currentDid);
  const { data: followsData } = useFollowsQuery(currentDid, dids.length, dids);

  useEffect(() => {
    if (!followsData?.follows) return;
    setFollows((prev) => {
      const next = new Set(prev);
      followsData.follows.forEach((f: { did: string }) => next.add(f.did));
      return next;
    });
  }, [followsData, setFollows]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
        People on Rocksky with similar music taste to @{handle}
      </p>
      {neighbours.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: "var(--color-text-muted)" }}>No circles found yet</p>
      )}
      {neighbours.map((n: Record<string, unknown>) => {
        const isFollowing = follows.has(n.did as string);
        const isMe = n.did === currentDid;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const artists: any[] = (n.topSharedArtistsDetails as any[]) || [];
        return (
          <div key={n.did as string} className="flex items-start gap-3 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
            <Link to={`/profile/${n.did}`} className="no-underline shrink-0">
              {(n.avatar as string) && !(n.avatar as string).endsWith("/@jpeg") ? (
                <Avatar src={n.avatar as string} name={n.displayName as string} size="48px" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--color-avatar-background)" }}>
                  <IconUser size={22} color="#fff" />
                </div>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <Link to={`/profile/${n.did}`} className="no-underline font-semibold text-sm" style={{ color: "var(--color-text)" }}>
                {n.displayName as string || n.handle as string}
              </Link>
              <span className="text-xs ml-1.5" style={{ color: "var(--color-text-muted)" }}>@{n.handle as string}</span>
              {artists.length > 0 && (
                <p className="text-xs mt-1 m-0" style={{ color: "var(--color-text-muted)" }}>
                  {currentDid === did ? "You" : "They"} both listen to{" "}
                  {artists.map((a, i) => (
                    <span key={a.id}>
                      <Link to={toPath(a.uri) || ""} className="no-underline" style={{ color: "var(--color-primary)" }}>{a.name}</Link>
                      {i < artists.length - 2 ? ", " : i < artists.length - 1 ? " and " : ""}
                    </span>
                  ))}
                </p>
              )}
            </div>
            {!isMe && currentDid && (
              <button
                onClick={() => {
                  if (isFollowing) {
                    setFollows((p) => { const s = new Set(p); s.delete(n.did as string); return s; });
                    unfollow(n.did as string);
                  } else {
                    setFollows((p) => new Set(p).add(n.did as string));
                    follow(n.did as string);
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer shrink-0 mt-1"
                style={{
                  backgroundColor: isFollowing ? "var(--color-surface-2)" : "var(--color-primary)",
                  color: isFollowing ? "var(--color-text)" : "#fff",
                }}
              >
                {isFollowing ? <IconCheck size={13} /> : <IconPlus size={13} />}
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── loved tracks ─────────────────────────────────────────────────────────────

function LovedTracksTab({ did }: { did: string }) {
  const PAGE = 30;
  const [page, setPage] = useState(1);
  const { data: tracks } = useLovedTracksQuery(did, (page - 1) * PAGE, PAGE);
  const { data: stats } = useProfileStatsByDidQuery(did);
  const list: Record<string, unknown>[] = tracks || [];

  return (
    <div>
      {(stats?.lovedTracks ?? 0) > 0 && (
        <p className="text-sm mb-3 flex items-center gap-1" style={{ color: "var(--color-text-muted)" }}>
          <IconHeart size={14} style={{ color: "var(--color-primary)" }} />
          {numeral(stats?.lovedTracks).format("0,0")} loved tracks
        </p>
      )}
      {list.map((t, i) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const art = (t as any).albumArt || (t as any).album_art;
        const title = t.title as string;
        const artist = ((t as any).artist || (t as any).albumArtist || (t as any).album_artist) as string;
        const uri = t.uri as string;
        const albumUri = ((t as any).albumUri || (t as any).album_uri) as string;
        const date = ((t as any).createdAt || (t as any).created_at || (t as any).date) as string;
        const href = toPath(uri);
        const albumHref = toPath(albumUri);
        return (
          <div key={String(t.id || i)} className="flex items-center gap-3 py-2.5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-2)" }}>
              {albumHref ? (
                <Link to={albumHref} className="block w-full h-full">
                  {art ? <img src={art} alt={title} className="w-full h-full object-cover" /> : (
                    <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
                  )}
                </Link>
              ) : art ? <img src={art} alt={title} className="w-full h-full object-cover" /> : (
                <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {href ? (
                <Link to={href} className="no-underline font-medium text-sm truncate block" style={{ color: "var(--color-text)" }}>{title}</Link>
              ) : (
                <p className="font-medium text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{title}</p>
              )}
              <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{artist}</p>
            </div>
            {date && <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-muted)" }}>{dayjs(date).fromNow()}</span>}
          </div>
        );
      })}
      {list.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--color-text-muted)" }}>No loved tracks yet</p>}

      <div className="flex items-center justify-between pt-4 pb-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 text-sm rounded-full border-none cursor-pointer disabled:opacity-30"
          style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-text)" }}
        >
          ← Prev
        </button>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={list.length < PAGE}
          className="px-4 py-2 text-sm rounded-full border-none cursor-pointer disabled:opacity-30"
          style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-text)" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ─── top track badge ─────────────────────────────────────────────────────────

function TopTrackBadge({ did }: { did: string }) {
  const [start7d, end7d] = getLastDays(7);
  const { data: tracks7d, isLoading: loading7d } = useTracksQuery(did, 0, 1, start7d, end7d);
  const { data: tracksAll, isLoading: loadingAll } = useTracksQuery(did, 0, 1);

  const isLoading = loading7d || loadingAll;
  const list7d = Array.isArray(tracks7d) ? tracks7d : [];
  const listAll = Array.isArray(tracksAll) ? tracksAll : [];
  const track = list7d[0] ?? listAll[0];

  if (isLoading || !track) return null;

  const trackHref = toPath(track.uri);
  const artistHref = toPath(track.artistUri);
  const albumHref = toPath(track.albumUri);
  const art = track.albumArt || track.album_art;
  const artist = track.albumArtist || track.artist || track.album_artist;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--color-surface-2)" }}>
      {albumHref ? (
        <Link to={albumHref} className="no-underline shrink-0">
          <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ backgroundColor: "var(--color-surface-3, var(--color-surface-2))" }}>
            {art ? <img src={art} alt={track.title} className="w-full h-full object-cover" /> : (
              <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
            )}
          </div>
        </Link>
      ) : (
        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--color-surface-3, var(--color-surface-2))" }}>
          {art ? <img src={art} alt={track.title} className="w-full h-full object-cover" /> : (
            <div className="w-full h-full flex items-center justify-center"><span className="opacity-20">♪</span></div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wide block mb-0.5" style={{ color: "var(--color-text-muted)" }}>Top Track</span>
        {trackHref ? (
          <Link to={trackHref} className="no-underline font-semibold text-sm truncate block" style={{ color: "var(--color-text)" }}>{track.title}</Link>
        ) : (
          <p className="font-semibold text-sm truncate m-0" style={{ color: "var(--color-text)" }}>{track.title}</p>
        )}
        {artistHref ? (
          <Link to={artistHref} className="no-underline text-xs truncate block" style={{ color: "var(--color-text-muted)" }}>{artist}</Link>
        ) : (
          <p className="text-xs truncate m-0" style={{ color: "var(--color-text-muted)" }}>{artist}</p>
        )}
      </div>
    </div>
  );
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <ContentLoader
      width="100%"
      height={160}
      viewBox="0 0 400 160"
      backgroundColor="var(--color-skeleton-background)"
      foregroundColor="var(--color-skeleton-foreground)"
    >
      <circle cx="60" cy="60" r="52" />
      <rect x="128" y="20" rx="4" ry="4" width="160" height="18" />
      <rect x="128" y="50" rx="3" ry="3" width="120" height="13" />
      <rect x="128" y="78" rx="3" ry="3" width="90" height="11" />
      <rect x="0" y="130" rx="8" ry="8" width="90" height="28" />
    </ContentLoader>
  );
}

// ─── main profile ─────────────────────────────────────────────────────────────

const TABS = ["Overview", "Library", "Followers", "Following", "Circles", "Loved Tracks"];

export default function Profile() {
  const { did } = useParams<{ did: string }>();
  const [activeTab, setActiveTab] = useState(0);
  const [follows, setFollows] = useAtom(followsAtom);
  const currentDid = localStorage.getItem("did");

  const { data: profile, isLoading } = useProfileByDidQuery(did!);
  const { data: stats } = useProfileStatsByDidQuery(did);

  // Init follow status for this profile
  const { data: followersCheckData } = useFollowersQuery(
    profile?.did,
    1,
    currentDid ? [currentDid] : undefined,
  );
  useEffect(() => {
    if (!followersCheckData || !profile?.did) return;
    setFollows((prev) => {
      const next = new Set(prev);
      if ((followersCheckData.followers || []).some((f: { did: string }) => f.did === currentDid)) {
        next.add(profile.did);
      } else {
        next.delete(profile.did);
      }
      return next;
    });
  }, [followersCheckData, profile?.did, currentDid, setFollows]);

  const { mutate: followAccount } = useFollowAccountMutation();
  const { mutate: unfollowAccount } = useUnfollowAccountMutation();

  const isOwnProfile = profile?.did === currentDid;
  const isFollowing = follows.has(profile?.did || "");

  const onFollow = () => {
    if (!profile) return;
    setFollows((prev) => new Set(prev).add(profile.did));
    followAccount(profile.did);
  };
  const onUnfollow = () => {
    if (!profile) return;
    setFollows((prev) => { const n = new Set(prev); n.delete(profile.did); return n; });
    unfollowAccount(profile.did);
  };

  if (!did) return null;

  return (
    <Main>
      <div className="pb-6">
        {/* Header */}
        <div className="px-4 pt-5 pb-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {isLoading ? <ProfileSkeleton /> : (
            <>
              <div className="flex items-center gap-4 mb-4">
                {!profile?.avatar?.endsWith("/@jpeg") ? (
                  <Avatar src={profile?.avatar} name={profile?.displayName} size="80px" />
                ) : (
                  <div className="w-20 h-20 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-avatar-background)" }}>
                    <IconUser size={40} color="#fff" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-xl m-0 mb-0.5 truncate" style={{ color: "var(--color-text)" }}>
                    {profile?.displayName}
                  </h2>
                  <a href={`https://bsky.app/profile/${profile?.handle}`} target="_blank" rel="noopener noreferrer" className="text-sm no-underline" style={{ color: "var(--color-primary)" }}>
                    @{profile?.handle}
                  </a>
                  <p className="text-xs m-0 mt-1" style={{ color: "var(--color-text-muted)" }}>
                    scrobbling since {dayjs(profile?.createdAt).format("MMM YYYY")}
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex gap-5 mb-4 flex-wrap">
                {[
                  { label: "Scrobbles", value: stats?.scrobbles },
                  { label: "Artists", value: stats?.artists },
                  { label: "Albums", value: stats?.albums },
                  { label: "Loved", value: stats?.lovedTracks },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center">
                    <span className="font-bold text-base" style={{ color: "var(--color-text)" }}>{numeral(value).format("0,0") || "—"}</span>
                    <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Top Track */}
              {profile?.did && (
                <div className="mb-4">
                  <TopTrackBadge did={profile.did} />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {!isOwnProfile && !isFollowing && (
                  <button onClick={onFollow} className="flex items-center gap-1.5 px-5 py-2 rounded-full border-none cursor-pointer font-semibold text-sm" style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}>
                    <IconPlus size={15} /> Follow
                  </button>
                )}
                {!isOwnProfile && isFollowing && (
                  <button onClick={onUnfollow} className="flex items-center gap-1.5 px-5 py-2 rounded-full border-none cursor-pointer font-semibold text-sm" style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-text)" }}>
                    <IconCheck size={15} /> Following
                  </button>
                )}
                <a href={`https://pdsls.dev/at/${profile?.did}`} target="_blank" rel="noopener noreferrer" className="flex items-center px-5 py-2 rounded-full no-underline font-medium text-sm" style={{ backgroundColor: "var(--color-surface-2)", color: "var(--color-text)" }}>
                  PDSls ↗
                </a>
                <ShareOnBluesky
                  variant="pill"
                  text={`Check out ${profile?.displayName || profile?.handle}'s music taste on Rocksky 🎵\n${window.location.href}`}
                />
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b" style={{ borderColor: "var(--color-border)", scrollbarWidth: "none" }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className="px-4 py-3 text-sm font-medium whitespace-nowrap border-none bg-transparent cursor-pointer shrink-0"
              style={{
                color: activeTab === i ? "var(--color-primary)" : "var(--color-text-muted)",
                borderBottom: activeTab === i ? "2px solid var(--color-primary)" : "2px solid transparent",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-4 pt-4" style={{ paddingBottom: "calc(24px + 56px + env(safe-area-inset-bottom))" }}>
          {(() => {
            const resolvedDid = profile?.did || did!;
            return (
              <>
                {activeTab === 0 && <OverviewTab did={resolvedDid} />}
                {activeTab === 1 && <LibraryTab did={resolvedDid} />}
                {activeTab === 2 && <FollowersTab did={resolvedDid} />}
                {activeTab === 3 && <FollowingTab did={resolvedDid} />}
                {activeTab === 4 && <CirclesTab did={resolvedDid} handle={profile?.handle || ""} />}
                {activeTab === 5 && <LovedTracksTab did={resolvedDid} />}
              </>
            );
          })()}
        </div>
      </div>
      <FloatingShoutBar
        uri={`at://${profile?.did || did}`}
        type="profile"
        title={profile?.displayName}
      />
    </Main>
  );
}
