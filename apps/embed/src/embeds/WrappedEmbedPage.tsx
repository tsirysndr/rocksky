import type { Profile } from "../types/profile";
import type { WrappedData } from "../xrpc/getWrapped";

export type WrappedEmbedPageProps = {
  profile: Profile;
  wrapped: WrappedData;
};

const GENRE_COLORS = ["#ff2876", "#a855f7", "#06b6d4", "#f59e0b", "#10b981"];

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  return `${h}h ${mins % 60}m`;
}

function n(v: number): string {
  return v.toLocaleString("en-US");
}

export function WrappedEmbedPage({ profile, wrapped }: WrappedEmbedPageProps) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        background: "linear-gradient(135deg, #0d0020 0%, #1a0035 50%, #0a001a 100%)",
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        color: "#fff",
        padding: "20px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Glow blobs */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 240, height: 240,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,85,247,0.3) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -40, left: -40, width: 200, height: 200,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,40,118,0.25) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
              Rocksky Wrapped
            </p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>
              {wrapped.year}
            </p>
          </div>
          <a
            href={`https://rocksky.app/profile/${profile.handle}`}
            target="_blank"
            style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}
          >
            {profile.avatar && !profile.avatar.endsWith("/@jpeg") && (
              <img src={profile.avatar} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
            )}
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{profile.displayName || profile.handle}</p>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>@{profile.handle}</p>
            </div>
          </a>
        </div>

        {/* Big number */}
        <div style={{ textAlign: "center", margin: "16px 0" }}>
          <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
            Total Scrobbles
          </p>
          <p style={{
            margin: "4px 0 4px",
            fontSize: 52,
            fontWeight: 900,
            lineHeight: 1,
            background: "linear-gradient(90deg, #ff2876 0%, #a855f7 50%, #06b6d4 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {n(wrapped.totalScrobbles)}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {formatMinutes(wrapped.totalListeningTimeMinutes)} of music
          </p>
        </div>

        {/* Top Artists */}
        {wrapped.topArtists.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ margin: "0 0 8px", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
              Top Artists
            </p>
            {wrapped.topArtists.slice(0, 3).map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: i === 0 ? "#ff2876" : i === 1 ? "#a855f7" : "#06b6d4", fontWeight: 700, fontSize: 11, width: 12, textAlign: "right", flexShrink: 0 }}>
                  {i + 1}
                </span>
                {a.picture ? (
                  <img src={a.picture} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                  {n(a.playCount)} plays
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Genres */}
        {wrapped.topGenres.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {wrapped.topGenres.map((g, i) => (
              <span
                key={g.genre}
                style={{
                  padding: "3px 10px",
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  background: `${GENRE_COLORS[i % GENRE_COLORS.length]}22`,
                  border: `1px solid ${GENRE_COLORS[i % GENRE_COLORS.length]}55`,
                  color: GENRE_COLORS[i % GENRE_COLORS.length],
                }}
              >
                {g.genre}
              </span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: 8 }}>
          {wrapped.newArtistsCount > 0 && (
            <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#a855f7" }}>{n(wrapped.newArtistsCount)}</p>
              <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>New Artists</p>
            </div>
          )}
          {wrapped.longestStreak > 0 && (
            <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#ff2876" }}>{wrapped.longestStreak}d</p>
              <p style={{ margin: 0, fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Best Streak</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 14, letterSpacing: "0.1em" }}>
          rocksky.app
        </p>
      </div>
    </div>
  );
}
