import {
  IconCalendar,
  IconClock,
  IconDownload,
  IconFlame,
  IconMicrophone2,
  IconMusic,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { profileAtom } from "../../atoms/profile";
import { useWrappedQuery } from "../../hooks/useWrapped";
import Main from "../../layouts/Main";
import { API_URL } from "../../consts";
import type { WrappedArtist, WrappedTrack } from "../../api/wrapped";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const GENRE_COLORS = [
  "#ff2876", "#a855f7", "#06b6d4", "#f59e0b", "#10b981",
];

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  return `${h}h ${m}m`;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function n(num: number): string {
  return num.toLocaleString("en-US");
}

// ─── Share Card (PNG capture target) ─────────────────────────────────────────

function ShareCard({
  cardRef,
  year,
  handle,
  displayName,
  avatar,
  totalScrobbles,
  totalListeningTimeMinutes,
  topArtists,
  topTracks,
  resolvedImages,
}: {
  cardRef?: React.RefObject<HTMLDivElement>;
  year: number;
  handle: string;
  displayName: string;
  avatar?: string;
  totalScrobbles: number;
  totalListeningTimeMinutes: number;
  topArtists: WrappedArtist[];
  topTracks: WrappedTrack[];
  resolvedImages?: Record<string, string>;
}) {
  const r = (url?: string) =>
    url && resolvedImages?.[url] ? resolvedImages[url] : url;

  return (
    <div
      ref={cardRef}
      style={{
        width: 600,
        height: 600,
        background:
          "linear-gradient(135deg, #0d0020 0%, #1a0035 40%, #0a001a 100%)",
        fontFamily: "'Space Grotesk', sans-serif",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ position: "absolute", top: -60, right: -60, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -40, left: -40, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,40,118,0.3) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ padding: 40, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", margin: 0, fontFamily: "'Syne', sans-serif", whiteSpace: "nowrap" }}>
              Rocksky Wrapped
            </p>
            <p style={{ color: "#fff", fontSize: 40, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>{year}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {avatar && !avatar.endsWith("/@jpeg") && (
              <img src={r(avatar)} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>{displayName}</p>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: 0 }}>@{handle}</p>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 4px", fontFamily: "'Syne', sans-serif" }}>
            Total Scrobbles
          </p>
          <p style={{ fontSize: 72, fontWeight: 900, margin: 0, lineHeight: 1, background: "linear-gradient(90deg, #ff2876 0%, #a855f7 50%, #06b6d4 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {n(totalScrobbles)}
          </p>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "6px 0 0", fontFamily: "'Syne', sans-serif" }}>
            {formatMinutes(totalListeningTimeMinutes)} of music
          </p>
        </div>

        <div>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 12px", fontFamily: "'Syne', sans-serif" }}>
            Top Artists
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topArtists.slice(0, 3).map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: i === 0 ? "#ff2876" : i === 1 ? "#a855f7" : "#06b6d4", fontSize: 13, fontWeight: 700, width: 16, textAlign: "right", flexShrink: 0 }}>
                  {i + 1}
                </span>
                {a.picture ? (
                  <img src={r(a.picture)} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
                )}
                <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name}
                </span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, flexShrink: 0 }}>
                  {n(a.playCount)} plays
                </span>
              </div>
            ))}
          </div>
        </div>

        {topTracks[0] && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(255,255,255,0.06)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)" }}>
            {topTracks[0].albumArt ? (
              <img src={r(topTracks[0].albumArt)} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 2px", fontFamily: "'Syne', sans-serif" }}>Top Track</p>
              <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topTracks[0].title}</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0 }}>{topTracks[0].artist}</p>
            </div>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, flexShrink: 0 }}>
              {n(topTracks[0].playCount)} plays
            </span>
          </div>
        )}

        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, margin: 0, textAlign: "center", letterSpacing: "0.1em", fontFamily: "'Syne', sans-serif" }}>
          rocksky.app
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] tracking-[0.22em] uppercase font-bold mb-3 m-0"
      style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Syne', sans-serif" }}
    >
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-4 ${className}`}
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {children}
    </div>
  );
}

function StatPill({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${accent}22` }}>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <p className="text-xl font-black leading-tight m-0" style={{ color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </p>
      <p className="text-xs m-0" style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'Syne', sans-serif" }}>
        {label}
      </p>
    </div>
  );
}

async function fetchAsBase64(url: string, apiUrl: string): Promise<string> {
  const res = await fetch(`${apiUrl}/proxy-image?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`proxy failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WrappedPage() {
  const profile = useAtomValue(profileAtom);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [downloading, setDownloading] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const shareCardRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

  const { data, isLoading } = useWrappedQuery(profile?.did, year);

  useEffect(() => {
    const id = "wrapped-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&family=Syne:wght@400;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (!data && !profile?.avatar) return;
    const urls = [
      profile?.avatar,
      ...(data?.topArtists.slice(0, 3).map((a) => a.picture) ?? []),
      data?.topTracks[0]?.albumArt,
    ].filter((u): u is string => !!u && !u.endsWith("/@jpeg"));

    const map: Record<string, string> = {};
    Promise.all(
      urls.map((url) =>
        fetchAsBase64(url, API_URL)
          .then((b64) => { map[url] = b64; })
          .catch(() => {}),
      ),
    ).then(() => setResolvedImages(map));
  }, [data, profile?.avatar]);

  const handleDownload = async () => {
    if (!shareCardRef.current) return;
    setDownloading(true);
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(shareCardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
        imagePlaceholder:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=",
      });
      const link = document.createElement("a");
      link.download = `rocksky-wrapped-${year}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  const maxMonthCount = data
    ? Math.max(...data.scrobblesPerMonth.map((m) => m.count), 1)
    : 1;

  const monthData = MONTH_LABELS.map((label, i) => {
    const found = data?.scrobblesPerMonth.find((m) => m.month === i + 1);
    return { label, count: found?.count ?? 0 };
  });

  return (
    <Main>
      {/* Off-screen card for html-to-image capture */}
      {profile && data && (
        <div style={{ position: "fixed", left: "-9999px", top: 0, pointerEvents: "none", zIndex: -1 }}>
          <ShareCard
            cardRef={shareCardRef}
            year={year}
            handle={profile.handle}
            displayName={profile.displayName || profile.handle}
            avatar={profile.avatar}
            totalScrobbles={data.totalScrobbles}
            totalListeningTimeMinutes={data.totalListeningTimeMinutes}
            topArtists={data.topArtists}
            topTracks={data.topTracks}
            resolvedImages={resolvedImages}
          />
        </div>
      )}

      <div className="px-4 pt-4 pb-28">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs tracking-[0.22em] uppercase font-bold m-0 mb-1" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Syne', sans-serif" }}>
            Rocksky
          </p>
          <h1
            className="text-4xl font-black leading-none m-0"
            style={{
              background: "linear-gradient(90deg, #ff2876 0%, #a855f7 50%, #06b6d4 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Wrapped {year}
          </h1>
        </div>

        {/* Year selector */}
        <div className="flex gap-2 flex-wrap mb-6">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className="px-4 py-1.5 rounded-full text-sm font-bold border-none cursor-pointer transition-all"
              style={{
                background: year === y ? "linear-gradient(135deg, #ff2876, #a855f7)" : "rgba(255,255,255,0.07)",
                color: year === y ? "#fff" : "rgba(255,255,255,0.5)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {y}
            </button>
          ))}
        </div>

        {!profile && (
          <Card>
            <p className="text-center m-0" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Syne', sans-serif" }}>
              Sign in to see your Wrapped
            </p>
          </Card>
        )}

        {profile && isLoading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl h-32 animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
            ))}
          </div>
        )}

        {profile && data && (
          <div className="space-y-4">
            {/* Hero stats */}
            <div
              className="rounded-3xl p-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #1a0035 0%, #0d001f 60%, #00050f 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ position: "absolute", top: -60, right: -60, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: -40, left: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,40,118,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />

              <div className="relative z-10 text-center mb-5">
                <SectionLabel>Total scrobbles</SectionLabel>
                <p
                  className="font-black leading-none m-0 mb-1"
                  style={{
                    fontSize: "clamp(48px, 18vw, 80px)",
                    background: "linear-gradient(90deg, #ff2876 0%, #a855f7 55%, #06b6d4 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {n(data.totalScrobbles)}
                </p>
                <p className="m-0 text-sm" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Syne', sans-serif" }}>
                  {formatMinutes(data.totalListeningTimeMinutes)} of music in {year}
                </p>
              </div>

              <div className="relative z-10 grid grid-cols-2 gap-3">
                <StatPill icon={<IconMicrophone2 size={16} />} label="New artists" value={n(data.newArtistsCount)} accent="#a855f7" />
                <StatPill icon={<IconFlame size={16} />} label="Longest streak" value={`${data.longestStreak}d`} accent="#ff2876" />
                {data.mostActiveHour !== undefined && (
                  <StatPill icon={<IconClock size={16} />} label="Peak hour" value={formatHour(data.mostActiveHour)} accent="#06b6d4" />
                )}
                {data.mostActiveDay && (
                  <StatPill icon={<IconCalendar size={16} />} label="Best day" value={`${n(data.mostActiveDay.count)} plays`} accent="#f59e0b" />
                )}
              </div>
            </div>

            {/* Top Artists */}
            {data.topArtists.length > 0 && (
              <div>
                <SectionLabel>Top Artists</SectionLabel>

                {/* #1 hero */}
                <div
                  className="rounded-2xl p-4 mb-2 relative overflow-hidden flex items-center gap-4"
                  style={{
                    background: "linear-gradient(135deg, rgba(168,85,247,0.2) 0%, rgba(255,40,118,0.1) 100%)",
                    border: "1px solid rgba(168,85,247,0.25)",
                  }}
                >
                  {data.topArtists[0].picture && (
                    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit", pointerEvents: "none" }}>
                      <img src={data.topArtists[0].picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.07, filter: "blur(8px)", transform: "scale(1.1)" }} />
                    </div>
                  )}
                  <div className="relative z-10 flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-full overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
                      {data.topArtists[0].picture ? (
                        <img src={data.topArtists[0].picture} alt={data.topArtists[0].name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <IconUser size={28} color="rgba(255,255,255,0.4)" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#a855f7", fontFamily: "'Syne', sans-serif" }}>
                        #1 Artist
                      </span>
                      <p className="text-xl font-black text-white truncate m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {data.topArtists[0].name}
                      </p>
                      <p className="text-sm m-0" style={{ color: "rgba(255,255,255,0.5)" }}>
                        {n(data.topArtists[0].playCount)} plays
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {data.topArtists.slice(1).map((artist, i) => (
                    <div
                      key={artist.id}
                      className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span className="font-black text-sm w-5 text-right shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {i + 2}
                      </span>
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                        {artist.picture ? (
                          <img src={artist.picture} alt={artist.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <IconUser size={18} color="rgba(255,255,255,0.3)" />
                          </div>
                        )}
                      </div>
                      <p className="text-white font-semibold flex-1 truncate text-sm m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {artist.name}
                      </p>
                      <p className="text-xs shrink-0 m-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {n(artist.playCount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Tracks */}
            {data.topTracks.length > 0 && (
              <div>
                <SectionLabel>Top Tracks</SectionLabel>

                {/* #1 hero */}
                <div
                  className="rounded-2xl p-4 mb-2 relative overflow-hidden flex items-center gap-4"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,40,118,0.18) 0%, rgba(168,85,247,0.1) 100%)",
                    border: "1px solid rgba(255,40,118,0.25)",
                  }}
                >
                  {data.topTracks[0].albumArt && (
                    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit", pointerEvents: "none" }}>
                      <img src={data.topTracks[0].albumArt} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.07, filter: "blur(10px)", transform: "scale(1.1)" }} />
                    </div>
                  )}
                  <div className="relative z-10 flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
                      {data.topTracks[0].albumArt ? (
                        <img src={data.topTracks[0].albumArt} alt={data.topTracks[0].title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <IconMusic size={28} color="rgba(255,255,255,0.4)" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: "#ff2876", fontFamily: "'Syne', sans-serif" }}>
                        #1 Track
                      </span>
                      <p className="text-xl font-black text-white truncate m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {data.topTracks[0].title}
                      </p>
                      <p className="text-sm m-0" style={{ color: "rgba(255,255,255,0.5)" }}>
                        {data.topTracks[0].artist} · {n(data.topTracks[0].playCount)} plays
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {data.topTracks.slice(1).map((track, i) => (
                    <div
                      key={track.id}
                      className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span className="font-black text-sm w-5 text-right shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                        {i + 2}
                      </span>
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                        {track.albumArt ? (
                          <img src={track.albumArt} alt={track.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <IconMusic size={18} color="rgba(255,255,255,0.3)" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {track.title}
                        </p>
                        <p className="text-xs truncate m-0" style={{ color: "rgba(255,255,255,0.45)" }}>
                          {track.artist}
                        </p>
                      </div>
                      <p className="text-xs shrink-0 m-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {n(track.playCount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Albums */}
            {data.topAlbums.length > 0 && (
              <div>
                <SectionLabel>Top Albums</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  {data.topAlbums.slice(0, 6).map((album, i) => (
                    <div
                      key={album.id}
                      className="rounded-xl overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      {album.albumArt ? (
                        <img src={album.albumArt} alt={album.title} className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <IconMusic size={24} color="rgba(255,255,255,0.2)" />
                        </div>
                      )}
                      <div className="p-2">
                        <span className="text-[10px] font-bold" style={{ color: i === 0 ? "#ff2876" : "rgba(255,255,255,0.3)" }}>
                          #{i + 1}
                        </span>
                        <p className="text-white text-xs font-semibold truncate m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {album.title}
                        </p>
                        <p className="text-[10px] truncate m-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {album.artist}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly Activity */}
            {data.scrobblesPerMonth.length > 0 && (
              <Card>
                <SectionLabel>Your {year} in Months</SectionLabel>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={monthData} barSize={14}>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "'Syne', sans-serif" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={{
                        background: "#1a0035",
                        border: "1px solid rgba(168,85,247,0.4)",
                        borderRadius: 10,
                        color: "#fff",
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 12,
                      }}
                      itemStyle={{ color: "#fff" }}
                      labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                      formatter={(v: number) => [`${n(v)} plays`, ""]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {monthData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.count === maxMonthCount ? "url(#barGradientMobile)" : "rgba(168,85,247,0.35)"}
                        />
                      ))}
                    </Bar>
                    <defs>
                      <linearGradient id="barGradientMobile" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff2876" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Top Genres */}
            {data.topGenres.length > 0 && (
              <div>
                <SectionLabel>Top Genres</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {data.topGenres.map((g, i) => (
                    <div
                      key={g.genre}
                      className="rounded-full px-3 py-1.5 flex items-center gap-1.5"
                      style={{
                        background: `${GENRE_COLORS[i % GENRE_COLORS.length]}22`,
                        border: `1px solid ${GENRE_COLORS[i % GENRE_COLORS.length]}55`,
                      }}
                    >
                      <span className="font-bold text-sm" style={{ color: GENRE_COLORS[i % GENRE_COLORS.length], fontFamily: "'Space Grotesk', sans-serif" }}>
                        {g.genre}
                      </span>
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {n(g.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* First & Last scrobble */}
            {(data.firstScrobble || data.lastScrobble) && (
              <div className="grid grid-cols-1 gap-3">
                {data.firstScrobble && (
                  <Card>
                    <div className="flex items-center gap-2 mb-2">
                      <IconSparkles size={13} color="#f59e0b" />
                      <SectionLabel>First scrobble of {year}</SectionLabel>
                    </div>
                    <p className="text-white font-bold truncate m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {data.firstScrobble.trackTitle}
                    </p>
                    <p className="text-sm truncate m-0 mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {data.firstScrobble.artistName}
                    </p>
                    <p className="text-xs mt-1.5 m-0" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Syne', sans-serif" }}>
                      {formatDate(data.firstScrobble.timestamp)}
                    </p>
                  </Card>
                )}
                {data.lastScrobble && (
                  <Card>
                    <div className="flex items-center gap-2 mb-2">
                      <IconSparkles size={13} color="#a855f7" />
                      <SectionLabel>Last scrobble of {year}</SectionLabel>
                    </div>
                    <p className="text-white font-bold truncate m-0" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {data.lastScrobble.trackTitle}
                    </p>
                    <p className="text-sm truncate m-0 mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {data.lastScrobble.artistName}
                    </p>
                    <p className="text-xs mt-1.5 m-0" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Syne', sans-serif" }}>
                      {formatDate(data.lastScrobble.timestamp)}
                    </p>
                  </Card>
                )}
              </div>
            )}

            {/* Share Card */}
            <Card>
              <SectionLabel>Share your Wrapped</SectionLabel>
              <p className="text-sm mb-4 m-0" style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'Syne', sans-serif" }}>
                Download your Wrapped card and share it anywhere.
              </p>

              {/* Preview */}
              <div className="overflow-hidden rounded-xl mb-4" style={{ height: 216 }}>
                <div style={{ transform: "scale(0.36)", transformOrigin: "top left", width: 600, height: 600 }}>
                  <ShareCard
                    year={year}
                    handle={profile.handle}
                    displayName={profile.displayName || profile.handle}
                    avatar={profile.avatar}
                    totalScrobbles={data.totalScrobbles}
                    totalListeningTimeMinutes={data.totalListeningTimeMinutes}
                    topArtists={data.topArtists}
                    topTracks={data.topTracks}
                  />
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-white border-none cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #ff2876, #a855f7)",
                  opacity: downloading ? 0.6 : 1,
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15,
                }}
              >
                <IconDownload size={18} />
                {downloading ? "Generating…" : "Download Card"}
              </button>
            </Card>
          </div>
        )}
      </div>
    </Main>
  );
}
