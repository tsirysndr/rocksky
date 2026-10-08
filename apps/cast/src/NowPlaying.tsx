import { memo, useEffect, useState } from "react";
import { artworkUrl, clock, type ReceiverState, type Track } from "./receiver";

function Icon({
  name,
  className = "",
}: {
  name:
    | "cast"
    | "music"
    | "pause"
    | "play"
    | "volume"
    | "phone"
    | "cloud"
    | "arrow";
  className?: string;
}) {
  const paths = {
    cast: (
      <>
        <path d="M3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <path d="M3 14a7 7 0 0 1 7 7M3 18a3 3 0 0 1 3 3" />
        <circle cx="3" cy="21" r=".7" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l12-2v13M9 9l12-2" />
        <ellipse cx="6" cy="18" rx="3" ry="2" />
        <ellipse cx="18" cy="16" rx="3" ry="2" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" strokeWidth="4" />
      </>
    ),
    play: <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    volume: (
      <>
        <path d="m11 5-6 4H2v6h3l6 4ZM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" />
      </>
    ),
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M10 18h4" />
      </>
    ),
    cloud: <path d="M6 18a4 4 0 0 1-.5-8A7 7 0 0 1 19 8a5 5 0 0 1 0 10Z" />,
    arrow: <path d="m8 5 7 7-7 7" />,
  };
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
const Artwork = memo(function Artwork({
  track,
  className = "",
}: {
  track: Track | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [track?.artwork]);
  return (
    <div className={`artwork ${className}`}>
      {track?.artwork && !failed ? (
        <img
          src={artworkUrl(track.artwork)}
          alt={`${track.album} album artwork`}
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="artwork-fallback"
          role="img"
          aria-label="Rocksky placeholder artwork"
        >
          <span className="fallback-glow" />
          <span className="fallback-orbit" />
          <span className="fallback-vinyl">
            <span>
              <Icon name="music" />
            </span>
          </span>
          <span className="fallback-brand">ROCKSKY</span>
          <span className="fallback-caption">
            a little closer to the music.
          </span>
        </div>
      )}
    </div>
  );
});
export type NowPlayingProps = {
  state: ReceiverState;
  onToggle?: () => void;
  onSeek?: (position: number) => void;
};
export function NowPlaying({ state, onToggle, onSeek }: NowPlayingProps) {
  const { track, phase, duration, position, queue } = state;
  const active = !!track && phase !== "idle";
  const percent =
    duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const backgroundArtwork = active ? artworkUrl(track?.artwork) : "";
  return (
    <main className={`tv-shell phase-${phase}`}>
      <div
        className="ambient"
        aria-hidden="true"
        style={
          backgroundArtwork
            ? {
                backgroundImage: `linear-gradient(#130825cc, #130825cc), url(${JSON.stringify(backgroundArtwork)})`,
              }
            : undefined
        }
      />
      <header className="tv-header flex items-center justify-between">
        <div className="brand flex items-center">
          <span>Rocksky</span>
        </div>
        <div className="cast-badge flex items-center">
          <Icon name="cast" />
          <span>CHROMECAST</span>
        </div>
      </header>
      {active ? (
        <>
          <section className="listening-layout">
            <Artwork track={track} className="hero-art" />
            <div className="track-details">
              <div className="eyebrow flex items-center">
                <span
                  className={`equalizer ${phase === "playing" ? "animated" : ""}`}
                >
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                {phase === "paused"
                  ? "ON PAUSE"
                  : phase === "loading"
                    ? "GETTING READY"
                    : phase === "error"
                      ? "PLAYBACK INTERRUPTED"
                      : "NOW PLAYING"}
              </div>
              <h1 className="track-title" title={track.title}>
                {track.title}
              </h1>
              <p className="track-artist" title={track.artist}>
                {track.artist}
              </p>
              <p className="track-album" title={track.album}>
                {track.album}
              </p>
              <div className="playback-timeline">
                <div
                  className="timeline-bar"
                  role={onSeek && duration ? "slider" : "progressbar"}
                  aria-label="Playback position"
                  aria-valuenow={Math.round(position)}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration)}
                  tabIndex={onSeek && duration ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (
                      onSeek &&
                      duration &&
                      ["ArrowLeft", "ArrowRight"].includes(event.key)
                    ) {
                      event.preventDefault();
                      onSeek(
                        Math.min(
                          duration,
                          Math.max(
                            0,
                            position + (event.key === "ArrowRight" ? 10 : -10),
                          ),
                        ),
                      );
                    }
                  }}
                  onClick={(event) => {
                    if (onSeek && duration) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      onSeek(
                        Math.max(
                          0,
                          Math.min(
                            duration,
                            ((event.clientX - rect.left) / rect.width) *
                              duration,
                          ),
                        ),
                      );
                    }
                  }}
                >
                  <div
                    className="timeline-fill"
                    style={{ transform: `scaleX(${percent / 100})` }}
                  />
                </div>
                <div className="time-labels flex justify-between">
                  <span>{clock(position)}</span>
                  <span>{duration > 0 ? clock(duration) : "—:—"}</span>
                </div>
              </div>
              <div className="playback-caption flex items-center">
                <button
                  className="play-toggle"
                  onClick={onToggle}
                  disabled={
                    !onToggle || phase === "loading" || phase === "error"
                  }
                  aria-label={phase === "playing" ? "Pause" : "Play"}
                >
                  <Icon name={phase === "playing" ? "pause" : "play"} />
                </button>
                <div className="source-caption">
                  <Icon name={track.source === "local" ? "phone" : "cloud"} />
                  <span>
                    {track.source === "local"
                      ? "From your local library"
                      : "From your music library"}
                  </span>
                </div>
              </div>
              {phase === "error" && (
                <p className="error-message" role="alert">
                  {state.error}
                </p>
              )}
            </div>
          </section>
          <Queue queue={queue} count={state.queueCount ?? queue.length} />
        </>
      ) : (
        <section className="idle-scene">
          <div className="idle-orbit">
            <div className="idle-record">
              <span className="idle-record-label">
                <Icon name="music" />
              </span>
            </div>
            <span className="orbit-star">✦</span>
          </div>
          <p className="eyebrow">YOUR MUSIC. A BIGGER STAGE.</p>
          <h1>
            {phase === "error" ? "Let’s reconnect." : "Make room for music."}
          </h1>
          <p className="idle-description">
            {phase === "error"
              ? state.error
              : "Pick a song in Rocksky and let the room listen."}
          </p>
          <div className="idle-instruction flex items-center">
            <Icon name="phone" />
            <span>Open Rocksky</span>
            <Icon name="arrow" />
            <Icon name="cast" />
            <span>Connect & play</span>
          </div>
        </section>
      )}
      <footer className="tv-footer flex items-center justify-between">
        <span>Music sounds better together.</span>
        <span className="flex items-center footer-device">
          <Icon name="cast" />
          rocksky.app
        </span>
      </footer>
    </main>
  );
}

const Queue = memo(function Queue({
  queue,
  count,
}: {
  queue: Track[];
  count: number;
}) {
  return (
    <section className="queue-section" aria-label="Up next">
      <div className="queue-heading flex items-center justify-between">
        <span>UP NEXT</span>
        <span>
          {count
            ? `${count} more ${count === 1 ? "track" : "tracks"}`
            : "Enjoy the moment"}
        </span>
      </div>
      <div className="queue-rail">
        {queue.slice(0, 3).map((item, index) => (
          <article
            key={`${item.id}-${index}`}
            className="queue-track flex items-center"
          >
            <span className="queue-rank">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Artwork track={item} />
            <div className="queue-copy">
              <h2 title={item.title}>{item.title}</h2>
              <p title={item.artist}>{item.artist}</p>
            </div>
            <span className="queue-duration">{clock(item.duration)}</span>
          </article>
        ))}
        {!queue.length && (
          <p className="queue-empty">
            Add something you love from Rocksky on your phone.
          </p>
        )}
      </div>
    </section>
  );
});
