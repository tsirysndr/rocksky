import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Disc3, Radio, UserRound } from "lucide-react";
import type { ScrobbleViewBasic } from "@rocksky/sdk";
import { appUrl, relativeTime, scrobbleUrl, trackUrl } from "./data";
import { scrobbleKey } from "./live-scrobbles";

function Image({
  src,
  alt,
  fallback,
  className,
}: {
  src?: string;
  alt: string;
  fallback: ReactNode;
  className: string;
}) {
  const [failed, setFailed] = useState<string>();
  return (
    <span className={className}>
      {src && src !== failed ? (
        <img
          src={src}
          alt={alt}
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

function Equalizer() {
  const [bars] = useState(() =>
    Array.from({ length: 5 }, () => ({
      height: `${12 + Math.random() * 12}px`,
      animationDuration: `${480 + Math.random() * 820}ms`,
      animationDelay: `${-Math.random() * 2400}ms`,
    })),
  );
  return (
    <span className="hero-scrobble-equalizer" aria-hidden="true">
      {bars.map((style, index) => (
        <i key={index} style={style} />
      ))}
    </span>
  );
}

export default function HeroScrobbles({
  tracks,
  pending,
  failed,
  live,
  connected,
  retry,
}: {
  tracks: ScrobbleViewBasic[];
  pending: boolean;
  failed: boolean;
  live: boolean;
  connected: boolean;
  retry: () => void;
}) {
  const reduce = useReducedMotion();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const status = !live
    ? "Paused"
    : connected
      ? "Live"
      : pending
        ? "Connecting"
        : "Refreshing";
  return (
    <aside
      className="hero-scrobbles"
      aria-labelledby="hero-scrobbles-title"
      data-live={live}
    >
      <div className="hero-scrobbles-header">
        <div>
          <Radio size={17} aria-hidden="true" />
          <h2 id="hero-scrobbles-title">Latest scrobbles</h2>
        </div>
        <span
          className={`hero-scrobbles-status${connected && live ? " is-live" : ""}`}
          role="status"
        >
          <i aria-hidden="true" />
          {status}
        </span>
      </div>
      {tracks.length ? (
        <ol className="hero-scrobbles-list">
          <AnimatePresence initial={false} mode="popLayout">
            {tracks.map((track) => {
              const href = scrobbleUrl(track.uri) || trackUrl(track.trackUri);
              const actor = track.did || track.handle?.replace(/^@/, "");
              const profile = actor
                ? `${appUrl}/profile/${encodeURIComponent(actor)}`
                : undefined;
              const Listener = profile ? "a" : "span";
              return (
                <motion.li
                  key={scrobbleKey(track)}
                  className="hero-scrobble"
                  layout={reduce ? false : "position"}
                  initial={reduce ? false : { opacity: 0, y: -56 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.98 }
                  }
                  transition={{ type: "spring", stiffness: 330, damping: 34 }}
                >
                  {href && (
                    <a
                      className="hero-scrobble-open"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open scrobble: ${track.title || "Untitled track"} by ${track.artist || "unknown artist"} (new tab)`}
                    />
                  )}
                  <div className="hero-scrobble-art-link">
                    <Image
                      className="hero-scrobble-art"
                      src={track.albumArt}
                      alt={`${track.album || track.title || "Album"} artwork`}
                      fallback={<Disc3 size={28} />}
                    />
                  </div>
                  <div className="hero-scrobble-info">
                    <span className="hero-scrobble-title" title={track.title}>
                      {track.title || "Untitled track"}
                    </span>
                    <span className="hero-scrobble-artist" title={track.artist}>
                      {track.artist || "Unknown artist"}
                    </span>
                    <Listener
                      href={profile}
                      target={profile ? "_blank" : undefined}
                      rel={profile ? "noopener noreferrer" : undefined}
                      aria-label={
                        profile
                          ? `Open ${track.handle ? `@${track.handle.replace(/^@/, "")}` : "listener"} profile (new tab)`
                          : undefined
                      }
                      className="hero-scrobble-listener"
                    >
                      <Image
                        className="hero-scrobble-avatar"
                        src={track.avatar}
                        alt=""
                        fallback={<UserRound size={14} />}
                      />
                      <span
                        title={track.handle ? `@${track.handle}` : undefined}
                      >
                        {track.handle
                          ? `@${track.handle.replace(/^@/, "")}`
                          : "A Rocksky listener"}
                      </span>
                    </Listener>
                  </div>
                  <time dateTime={track.createdAt}>
                    {relativeTime(track.createdAt)}
                  </time>
                  <Equalizer />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      ) : pending ? (
        <div
          className="hero-scrobbles-loading"
          role="status"
          aria-label="Loading latest scrobbles"
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <div className="hero-scrobble-placeholder" key={index}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : (
        <div className="hero-scrobbles-empty" role="status">
          <Disc3 size={30} />
          <p>
            {failed
              ? "The live feed is taking a break."
              : "The next listen starts here."}
          </p>
          {failed && (
            <button type="button" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      )}
      <div className="hero-scrobbles-footer">
        <span>
          {!live
            ? "Auto-refresh paused"
            : failed && tracks.length
              ? "Showing the last available listens"
              : "From listeners across Rocksky"}
        </span>
        {failed ? (
          <button type="button" onClick={retry}>
            Retry
          </button>
        ) : (
          <a href="#community">
            More listens <ArrowUpRight size={13} />
          </a>
        )}
      </div>
    </aside>
  );
}
