import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { toPng } from "html-to-image";
import { profileAtom } from "../../atoms/profile";
import { useWrappedQuery } from "../../hooks/useWrapped";
import Main from "../../layouts/Main";
import type { WrappedArtist, WrappedTrack } from "../../api/wrapped";
import { IconDownload, IconMusic, IconUser, IconCalendar, IconClock, IconFlame, IconSparkles, IconMicrophone2 } from "@tabler/icons-react";
import { API_URL } from "../../consts";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const GENRE_COLORS = [
  "#ff2876",
  "#a855f7",
  "#06b6d4",
  "#f59e0b",
  "#10b981",
  "#f43f5e",
  "#8b5cf6",
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
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function numberWithCommas(n: number): string {
  return n.toLocaleString("en-US");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ArtistAvatar({ artist, size = 64 }: { artist: WrappedArtist; size?: number }) {
  if (artist.picture) {
    return (
      <img
        src={artist.picture}
        alt={artist.name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"
    >
      <IconUser size={size * 0.4} color="rgba(255,255,255,0.5)" />
    </div>
  );
}

function AlbumArt({ src, size = 56, alt = "" }: { src?: string; size?: number; alt?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        style={{ width: size, height: size }}
        className="rounded-lg object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0"
    >
      <IconMusic size={size * 0.4} color="rgba(255,255,255,0.4)" />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs tracking-[0.25em] uppercase mb-3 font-bold"
      style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'Syne', sans-serif" }}
    >
      {children}
    </p>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div
        className="w-10 h-20 rounded-xl flex items-center justify-center"
        style={{ background: `${accent}22` }}
      >
        <span style={{ color: accent }} className="mt-[4px]">{icon}</span>
      </div>
      <div>
        <p
          className="text-2xl font-black leading-tight ms-[10px] mb-[5px]"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}
        >
          {value}
        </p>
        <p className="text-sm ms-[10px] mt-[0px]" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Syne', sans-serif" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

// ─── Share card (captured as PNG) ────────────────────────────────────────────

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
  const r = (url?: string) => (url && resolvedImages?.[url]) ? resolvedImages[url] : url;

  return (
    <div
      ref={cardRef}
      style={{
        width: 600,
        height: 600,
        background: "linear-gradient(135deg, #0d0020 0%, #1a0035 40%, #0a001a 100%)",
        fontFamily: "'Space Grotesk', sans-serif",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Glow blobs */}
      <div style={{
        position: "absolute", top: -60, right: -60,
        width: 300, height: 300,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -40, left: -40,
        width: 260, height: 260,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,40,118,0.3) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ padding: 40, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", margin: 0, fontFamily: "'Syne', sans-serif" }}>
              Rocksky Wrapped
            </p>
            <p style={{ color: "#fff", fontSize: 40, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>
              {year}
            </p>
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

        {/* Big stat */}
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 4px", fontFamily: "'Syne', sans-serif" }}>
            Total Scrobbles
          </p>
          <p style={{
            fontSize: 72,
            fontWeight: 900,
            margin: 0,
            lineHeight: 1,
            background: "linear-gradient(90deg, #ff2876 0%, #a855f7 50%, #06b6d4 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {numberWithCommas(totalScrobbles)}
          </p>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "6px 0 0", fontFamily: "'Syne', sans-serif" }}>
            {formatMinutes(totalListeningTimeMinutes)} of music
          </p>
        </div>

        {/* Top artists */}
        <div>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 12px", fontFamily: "'Syne', sans-serif" }}>
            Top Artists
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topArtists.slice(0, 3).map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  color: i === 0 ? "#ff2876" : i === 1 ? "#a855f7" : "#06b6d4",
                  fontSize: 13,
                  fontWeight: 700,
                  width: 16,
                  textAlign: "right",
                  flexShrink: 0,
                }}>
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
                  {numberWithCommas(a.playCount)} plays
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top track */}
        {topTracks[0] && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(255,255,255,0.06)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)" }}>
            {topTracks[0].albumArt ? (
              <img src={r(topTracks[0].albumArt)} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", margin: "0 0 2px", fontFamily: "'Syne', sans-serif" }}>Top Track</p>
              <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {topTracks[0].title}
              </p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0 }}>{topTracks[0].artist}</p>
            </div>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, flexShrink: 0 }}>
              {numberWithCommas(topTracks[0].playCount)} plays
            </span>
          </div>
        )}

        {/* Footer */}
        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, margin: 0, textAlign: "center", letterSpacing: "0.1em", fontFamily: "'Syne', sans-serif" }}>
          rocksky.app
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function WrappedSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-2xl h-40" style={{ background: "rgba(255,255,255,0.05)" }} />
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

async function fetchAsBase64(url: string): Promise<string> {
  const proxyUrl = `${API_URL}/proxy-image?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`proxy-image failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function WrappedPage() {
  const profile = useAtomValue(profileAtom);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [downloading, setDownloading] = useState(false);
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const shareCardRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

  const { data, isLoading } = useWrappedQuery(profile?.did, year);

  // Inject Google Fonts
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

  // Pre-fetch all ShareCard images as base64 so the off-screen card has no external URLs
  useEffect(() => {
    if (!data && !profile?.avatar) return;
    const urls = [
      profile?.avatar,
      ...data?.topArtists.slice(0, 3).map((a) => a.picture) ?? [],
      data?.topTracks[0]?.albumArt,
    ].filter((u): u is string => !!u && !u.endsWith("/@jpeg"));

    const map: Record<string, string> = {};
    Promise.all(
      urls.map((url) =>
        fetchAsBase64(url)
          .then((b64) => { map[url] = b64; })
          .catch(() => { /* skip on proxy failure */ }),
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
    ? Math.max(...(data.scrobblesPerMonth.map((m) => m.count) || [1]), 1)
    : 1;

  const monthData = MONTH_LABELS.map((label, i) => {
    const found = data?.scrobblesPerMonth.find((m) => m.month === i + 1);
    return { label, count: found?.count ?? 0 };
  });

  return (
    <Main withRightPane={false}>
      {/* Font keyframes / globals */}
      <style>{`
        @keyframes wrapped-fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wrapped-section {
          animation: wrapped-fade-in 0.5s ease both;
        }
        .wrapped-section:nth-child(1) { animation-delay: 0.05s; }
        .wrapped-section:nth-child(2) { animation-delay: 0.10s; }
        .wrapped-section:nth-child(3) { animation-delay: 0.15s; }
        .wrapped-section:nth-child(4) { animation-delay: 0.20s; }
        .wrapped-section:nth-child(5) { animation-delay: 0.25s; }
        .wrapped-section:nth-child(6) { animation-delay: 0.30s; }
        .wrapped-section:nth-child(7) { animation-delay: 0.35s; }
        .wrapped-section:nth-child(8) { animation-delay: 0.40s; }
        .wrapped-section:nth-child(9) { animation-delay: 0.45s; }
      `}</style>

      <div
        className="mt-[60px] mb-[120px] mx-auto px-4 sm:px-6"
        style={{ maxWidth: 900, fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {/* ── Page header ── */}
        <div className="wrapped-section flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p
              className="text-xs tracking-[0.25em] uppercase mb-2 font-bold"
              style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Syne', sans-serif" }}
            >
              Rocksky
            </p>
            <h1
              className="text-5xl sm:text-6xl font-black leading-none"
              style={{
                background: "linear-gradient(90deg, #ff2876 0%, #a855f7 50%, #06b6d4 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Wrapped {year}
            </h1>
          </div>

          {/* Year selector */}
          <div className="flex gap-2 flex-wrap mb-[20px]">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className="px-4 py-2 me-[6px] rounded-full text-sm font-bold transition-all duration-150"
                style={{
                  background: year === y ? "linear-gradient(135deg, #ff2876, #a855f7)" : "rgba(255,255,255,0.07)",
                  color: year === y ? "#fff" : "rgba(255,255,255,0.5)",
                  border: "1px solid",
                  borderColor: year === y ? "transparent" : "rgba(255,255,255,0.1)",
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {!profile && (
          <div
            className="wrapped-section rounded-2xl p-10 text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.6)", fontFamily: "'Syne', sans-serif" }}>
              Sign in to see your Wrapped
            </p>
          </div>
        )}

        {profile && isLoading && <WrappedSkeleton />}

        {profile && data && (
          <>
            {/* ── Hero stats ── */}
            <div
              className="wrapped-section rounded-3xl p-8 sm:p-10 mb-6 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #1a0035 0%, #0d001f 60%, #00050f 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Glow blobs */}
              <div style={{
                position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", bottom: -60, left: -60, width: 280, height: 280, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(255,40,118,0.2) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-8">
                <div className="flex-1 text-center sm:text-left">
                  <SectionLabel>Total scrobbles</SectionLabel>
                  <p
                    className="font-black leading-none mb-2"
                    style={{
                      fontSize: "clamp(52px, 10vw, 88px)",
                      background: "linear-gradient(90deg, #ff2876 0%, #a855f7 55%, #06b6d4 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {numberWithCommas(data.totalScrobbles)}
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Syne', sans-serif", fontSize: 15 }}>
                    {formatMinutes(data.totalListeningTimeMinutes)} of music in {year}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
                  <StatCard icon={<IconMicrophone2 size={18} />} label="New artists" value={numberWithCommas(data.newArtistsCount)} accent="#a855f7" />
                  <StatCard icon={<IconFlame size={18} />} label="Longest streak" value={`${data.longestStreak}d`} accent="#ff2876" />
                  {data.mostActiveHour !== undefined && (
                    <StatCard icon={<IconClock size={18} />} label="Peak hour" value={formatHour(data.mostActiveHour)} accent="#06b6d4" />
                  )}
                  {data.mostActiveDay && (
                    <StatCard icon={<IconCalendar size={18} />} label="Best day" value={numberWithCommas(data.mostActiveDay.count) + " plays"} accent="#f59e0b" />
                  )}
                </div>
              </div>
            </div>

            {/* ── Top Artists ── */}
            {data.topArtists.length > 0 && (
              <div className="wrapped-section mt-[50px] mb-6">
                <SectionLabel>Top Artists</SectionLabel>

                {/* #1 artist hero */}
                <div
                  className="rounded-3xl p-[16px] mb-3 relative overflow-hidden flex items-center gap-6"
                  style={{
                    background: "linear-gradient(135deg, rgba(168,85,247,0.2) 0%, rgba(255,40,118,0.1) 100%)",
                    border: "1px solid rgba(168,85,247,0.25)",
                  }}
                >
                  {data.topArtists[0].picture && (
                    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit", pointerEvents: "none" }}>
                      <img
                        src={data.topArtists[0].picture}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.07, filter: "blur(8px)", transform: "scale(1.1)" }}
                      />
                    </div>
                  )}
                  <div className="relative z-10 flex items-center gap-5 flex-1 min-w-0">
                    <ArtistAvatar artist={data.topArtists[0]} size={80} />
                    <div className="min-w-0 ms-[14px]">
                      <span
                        className="text-xs font-bold tracking-widest uppercase"
                        style={{ color: "#a855f7", fontFamily: "'Syne', sans-serif" }}
                      >
                        #1 Artist
                      </span>
                      <p className="text-3xl font-black text-white truncate m-[0px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {data.topArtists[0].name}
                      </p>
                      <p className="m-[0px]" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Syne', sans-serif", fontSize: 14 }}>
                        {numberWithCommas(data.topArtists[0].playCount)} plays
                      </p>
                    </div>
                  </div>
                </div>

                {/* Remaining artists */}
                <div className="space-y-2">
                  {data.topArtists.slice(1).map((artist, i) => (
                    <div
                      key={artist.id}
                      className="rounded-2xl px-[10px] py-[8px] flex items-center gap-4"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span
                        className="font-black text-base w-5 text-right flex-shrink-0 me-[8px]"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        {i + 2}
                      </span>
                      <ArtistAvatar artist={artist} size={44} />
                      <p className="text-white font-semibold flex-1 truncate ms-[10px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {artist.name}
                      </p>
                      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, flexShrink: 0, fontFamily: "'Syne', sans-serif" }}>
                        {numberWithCommas(artist.playCount)} plays
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Top Tracks ── */}
            {data.topTracks.length > 0 && (
              <div className="wrapped-section mt-[50px] mb-6">
                <SectionLabel>Top Tracks</SectionLabel>

                {/* #1 track hero */}
                <div
                  className="rounded-3xl p-[15px] mb-3 relative overflow-hidden flex items-center gap-5"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,40,118,0.18) 0%, rgba(168,85,247,0.1) 100%)",
                    border: "1px solid rgba(255,40,118,0.25)",
                  }}
                >
                  {data.topTracks[0].albumArt && (
                    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "inherit", pointerEvents: "none" }}>
                      <img
                        src={data.topTracks[0].albumArt}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.07, filter: "blur(10px)", transform: "scale(1.1)" }}
                      />
                    </div>
                  )}
                  <div className="relative z-10 flex items-center gap-5 flex-1 min-w-0">
                    <AlbumArt src={data.topTracks[0].albumArt} size={80} alt={data.topTracks[0].title} />
                    <div className="min-w-0 ms-[15px]">
                      <span
                        className="text-xs font-bold tracking-widest uppercase"
                        style={{ color: "#ff2876", fontFamily: "'Syne', sans-serif" }}
                      >
                        #1 Track
                      </span>
                      <p className="text-2xl font-black text-white truncate mt-0.5 m-[0px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {data.topTracks[0].title}
                      </p>
                      <p className="m-[0px]" style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "'Syne', sans-serif" }}>
                        {data.topTracks[0].artist} · {numberWithCommas(data.topTracks[0].playCount)} plays
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {data.topTracks.slice(1).map((track, i) => (
                    <div
                      key={track.id}
                      className="rounded-2xl px-[10px] py-[10px] flex items-center gap-4"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      <span
                        className="font-black text-base w-5 text-right flex-shrink-0 me-[10px]"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                      >
                        {i + 2}
                      </span>
                      <AlbumArt src={track.albumArt} size={44} alt={track.title} />
                      <div className="flex-1 min-w-0 ms-[10px]">
                        <p className="text-white font-semibold truncate m-[0px]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {track.title}
                        </p>
                        <p className="text-sm truncate m-[0px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                          {track.artist}
                        </p>
                      </div>
                      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, flexShrink: 0, fontFamily: "'Syne', sans-serif" }}>
                        {numberWithCommas(track.playCount)} plays
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Top Albums ── */}
            {data.topAlbums.length > 0 && (
              <div className="wrapped-section mt-[50px] mb-6">
                <SectionLabel>Top Albums</SectionLabel>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {data.topAlbums.map((album, i) => (
                    <div
                      key={album.id}
                      className="rounded-2xl overflow-hidden group cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      {album.albumArt ? (
                        <img
                          src={album.albumArt}
                          alt={album.title}
                          className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-white/5 flex items-center justify-center">
                          <IconMusic size={32} color="rgba(255,255,255,0.2)" />
                        </div>
                      )}
                      <div className="p-[10px]">
                        <span className="text-xs font-bold" style={{ color: i === 0 ? "#ff2876" : "rgba(255,255,255,0.3)" }}>
                          #{i + 1}
                        </span>
                        <p className="text-white text-sm font-semibold truncate m-[0px] mt-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {album.title}
                        </p>
                        <p className="text-xs truncate m-[0px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                          {album.artist}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Monthly Activity ── */}
            {data.scrobblesPerMonth.length > 0 && (
              <div
                className="wrapped-section rounded-3xl p-[15px] sm:p-8 mt-[50px] mb-6"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <SectionLabel>Your {year} in Months</SectionLabel>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={monthData} barSize={18}>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "'Syne', sans-serif" }}
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
                        fontSize: 13,
                      }}
                      itemStyle={{ color: "#fff" }}
                      labelStyle={{ color: "rgba(255,255,255,0.6)", fontFamily: "'Syne', sans-serif" }}
                      formatter={(v: number) => [`${numberWithCommas(v)} plays`, ""]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {monthData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={
                            entry.count === maxMonthCount
                              ? "url(#barGradient)"
                              : "rgba(168,85,247,0.35)"
                          }
                        />
                      ))}
                    </Bar>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff2876" />
                        <stop offset="100%" stopColor="#a855f7" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Top Genres ── */}
            {data.topGenres.length > 0 && (
              <div className="wrapped-section mt-[50px] mb-[20px]">
                <SectionLabel>Top Genres</SectionLabel>
                <div className="flex flex-wrap gap-3">
                  {data.topGenres.map((g, i) => (
                    <div
                      key={g.genre}
                      className="rounded-full px-[10px] py-2.5 flex items-center gap-2 me-[10px] pb-[3px]"
                      style={{
                        background: `${GENRE_COLORS[i % GENRE_COLORS.length]}22`,
                        border: `1px solid ${GENRE_COLORS[i % GENRE_COLORS.length]}55`,
                      }}
                    >
                      <span
                        className="font-bold me-[3px]"
                        style={{ color: GENRE_COLORS[i % GENRE_COLORS.length], fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {g.genre}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontFamily: "'Syne', sans-serif" }}>
                        {numberWithCommas(g.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── First & Last scrobble ── */}
            {(data.firstScrobble || data.lastScrobble) && (
              <div className="wrapped-section grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {data.firstScrobble && (
                  <div
                    className="rounded-2xl p-[15px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="mr-[5px]">
                        <IconSparkles size={14} color="#f59e0b" />
                      </div>
                      <SectionLabel>First scrobble of {year}</SectionLabel>
                    </div>
                    <p className="text-white font-bold truncate" style={{ fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                      {data.firstScrobble.trackTitle}
                    </p>
                    <p className="text-sm truncate mt-0.5" style={{ color: "rgba(255,255,255,0.45)", margin: 0, marginTop: 5 }}>
                      {data.firstScrobble.artistName}
                    </p>
                    <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Syne', sans-serif", margin: 0, marginTop: 5 }}>
                      {formatDate(data.firstScrobble.timestamp)}
                    </p>
                  </div>
                )}
                {data.lastScrobble && (
                  <div
                    className="rounded-2xl p-[15px]"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="mr-[5px]">
                       <IconSparkles size={14} color="#a855f7" />
                      </div>
                      <SectionLabel>Last scrobble of {year}</SectionLabel>
                    </div>
                    <p className="text-white font-bold truncate" style={{ fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                      {data.lastScrobble.trackTitle}
                    </p>
                    <p className="text-sm truncate m-[0px]" style={{ color: "rgba(255,255,255,0.45)", margin: 0, marginTop: 5 }}>
                      {data.lastScrobble.artistName}
                    </p>
                    <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Syne', sans-serif", margin: 0, marginTop: 5 }}>
                      {formatDate(data.lastScrobble.timestamp)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Share card ── */}
            <div
              className="wrapped-section rounded-3xl p-[18px] sm:p-8"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <SectionLabel>Share your Wrapped</SectionLabel>
              <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'Syne', sans-serif" }}>
                Download your Wrapped card and share it anywhere.
              </p>

              <div className="flex flex-col items-center gap-6">
                {/* Card preview — visual only, no ref, inside CSS scale */}
                <div className="overflow-hidden rounded-2xl" style={{ maxWidth: 360, width: "100%", height: 360 }}>
                  <div style={{ transform: "scale(0.6)", transformOrigin: "top left", width: 600, height: 600 }}>
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
                  className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white transition-opacity"
                  style={{
                    background: "linear-gradient(135deg, #ff2876, #a855f7)",
                    opacity: downloading ? 0.6 : 1,
                    cursor: downloading ? "not-allowed" : "pointer",
                    border: "none",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 15,
                  }}
                >
                  <IconDownload size={18} />
                  {downloading ? "Generating…" : "Download Card"}
                </button>
              </div>
            </div>

            {/* Off-screen full-size card — used only for html-to-image capture */}
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
          </>
        )}
      </div>
    </Main>
  );
}
