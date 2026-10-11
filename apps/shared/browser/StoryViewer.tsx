import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import {
  STORY_DURATION,
  storyPath,
  shoutUri,
  type StoryItem,
} from "./storyModel";
import { storyLinks, type StoryLink } from "../storyLinks";
import musicbrainz from "./story-assets/musicbrainz.svg";
import discogs from "./story-assets/discogs.svg";
import pdsls from "./story-assets/pdsls.webp";
import "./StoryViewer.css";

dayjs.extend(relativeTime);
dayjs.extend(utc);
const logos = { MusicBrainz: musicbrainz, Discogs: discogs, PDSls: pdsls };

type Props = {
  stories: StoryItem[];
  startIndex: number;
  onClose: () => void;
  onNavigate: (path: string) => void;
  loadLinks: (story: StoryItem) => Promise<StoryLink[]>;
  onLike: (story: StoryItem, liked: boolean) => Promise<unknown>;
  onPostShout: (uri: string, message: string) => Promise<unknown>;
  onSignIn: () => void;
  hidden?: boolean;
};

function Glyph({
  kind,
  filled = false,
}: {
  kind: "heart" | "share" | "shout" | "user" | "close";
  filled?: boolean;
}) {
  const paths = {
    heart:
      "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
    share: "M13 4l8 7-8 7v-4C7 14 4 16 2 20c0-9 4-12 11-12V4Z",
    shout:
      "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
    user: "M20 21v-2a7 7 0 0 0-14 0v2M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    close: "M6 6l12 12M6 18L18 6",
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

function Marquee({
  title,
  onClick,
  paused,
}: {
  title: string;
  onClick?: () => void;
  paused: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  useEffect(() => {
    const measure = () =>
      setOverflow(
        Math.max(
          0,
          (line.current?.scrollWidth || 0) - (box.current?.clientWidth || 0),
        ),
      );
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    if (line.current) observer.observe(line.current);
    measure();
    return () => observer.disconnect();
  }, [title]);
  return (
    <div className="rs-story-title" ref={box} data-overflow={overflow > 1}>
      <button
        className="rs-story-title-button"
        onClick={onClick}
        disabled={!onClick}
        title={title}
        style={{ width: overflow > 1 ? "max-content" : "100%" }}
      >
        <span
          ref={line}
          className={overflow > 1 ? "rs-story-marquee" : undefined}
          style={
            {
              "--travel": `${-overflow}px`,
              animationDuration: `${Math.max(6, overflow / 28 + 3)}s`,
              animationPlayState: paused ? "paused" : "running",
            } as CSSProperties
          }
        >
          {title}
        </span>
      </button>
    </div>
  );
}

export default function StoryViewer(props: Props) {
  // Keep the sequence stable while background feed refetches arrive.
  const [stories] = useState(props.stories);
  const [index, setIndex] = useState(
    Math.min(Math.max(props.startIndex, 0), Math.max(0, stories.length - 1)),
  );
  const current = stories[index];
  const callbacks = useRef(props);
  callbacks.current = props;
  const panel = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const [foreground, setForeground] = useState(!document.hidden);
  const [links, setLinks] = useState<StoryLink[]>([]);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [likePending, setLikePending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [composer, setComposer] = useState(false);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [status, setStatus] = useState("");
  const touch = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const paused = !foreground || !!props.hidden || sharing || composer;
  const next = useCallback(() => {
    if (index + 1 >= stories.length) callbacks.current.onClose();
    else setIndex(index + 1);
  }, [index, stories.length]);
  const previous = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const listener = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  useEffect(() => {
    if (!props.hidden && !composer) panel.current?.focus();
  }, [props.hidden, composer]);
  useEffect(() => {
    if (paused) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - start) / STORY_DURATION);
      if (progress.current)
        progress.current.style.transform = `scaleX(${fraction})`;
      if (fraction >= 1) next();
      else frame = requestAnimationFrame(tick);
    };
    if (progress.current) progress.current.style.transform = "scaleX(0)";
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, paused, next]);
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setStatus("");
    setLinks(storyLinks({ uri: current.uri || current.trackUri }));
    callbacks.current
      .loadLinks(current)
      .then((result) => {
        if (!cancelled) setLinks(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [current]);

  if (!current) return null;
  const key = current.trackUri || current.trackId || current.id;
  const liked = likes[key] ?? current.liked ?? false;
  const count = Math.max(
    0,
    (current.likesCount || 0) + Number(liked) - Number(!!current.liked),
  );
  const navigate = (path?: string) => {
    if (path) {
      props.onClose();
      props.onNavigate(path);
    }
  };
  const toggleLike = async () => {
    if (likePending) return;
    if (!localStorage.getItem("token")) {
      props.onSignIn();
      return;
    }
    setLikePending(true);
    setLikes((values) => ({ ...values, [key]: !liked }));
    try {
      await props.onLike(current, !liked);
    } catch {
      setLikes((values) => ({ ...values, [key]: liked }));
      setStatus("Could not update your like. Please try again.");
    } finally {
      setLikePending(false);
    }
  };
  const share = async () => {
    const path = storyPath(current.uri) || storyPath(current.trackUri);
    if (!path) {
      setStatus("This story has no shareable link yet.");
      return;
    }
    const url = `https://rocksky.app${path}`;
    setSharing(true);
    try {
      if (navigator.share)
        await navigator.share({
          title: `${current.title} — ${current.artist}`,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setStatus("Story link copied");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setStatus("Could not share this story. Please try again.");
    } finally {
      setSharing(false);
    }
  };
  const openComposer = () => {
    if (!localStorage.getItem("token")) {
      props.onSignIn();
      return;
    }
    setComposer(true);
    setStatus("");
  };

  return createPortal(
    <div
      className="rs-story-backdrop"
      style={{ visibility: props.hidden ? "hidden" : undefined }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        ref={panel}
        className="rs-story-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Listening story"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (props.hidden) return;
          if (e.key === "Escape") {
            e.stopPropagation();
            if (composer && !posting) setComposer(false);
            else if (!composer) props.onClose();
          }
          if ((e.target as HTMLElement).matches("textarea,input")) return;
          if (!composer && e.key === "ArrowRight") {
            e.preventDefault();
            next();
          }
          if (!composer && e.key === "ArrowLeft") {
            e.preventDefault();
            previous();
          }
          if (e.key === "Tab") {
            const nodes = Array.from(
              panel.current?.querySelectorAll<HTMLElement>(
                composer
                  ? ".rs-story-composer button:not(:disabled), .rs-story-composer textarea"
                  : "button:not(:disabled), a[href]",
              ) || [],
            );
            if (!nodes.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === panel.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
        onTouchStart={(e) => {
          touch.current = null;
          suppressClick.current = false;
          if (
            composer ||
            ((e.target as HTMLElement).closest("button,a,textarea") &&
              !(e.target as HTMLElement).closest(".rs-story-art-area"))
          )
            return;
          suppressClick.current = false;
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x,
            dy = e.changedTouches[0].clientY - start.y;
          const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
          if (Math.abs(delta) >= 50) {
            suppressClick.current = true;
            if (delta < 0) next();
            else previous();
          }
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {current.albumArt && (
          <img className="rs-story-background" src={current.albumArt} alt="" />
        )}
        <div
          className="rs-story-content"
          aria-hidden={composer || undefined}
          style={{ pointerEvents: composer ? "none" : undefined }}
        >
          <div
            className="rs-story-progress"
            aria-label="Current story progress"
          >
            <div ref={progress} />
          </div>
          <header className="rs-story-header">
            <button
              className="rs-story-profile"
              onClick={() =>
                navigate(`/profile/${current.did || current.handle}`)
              }
            >
              <span className="rs-story-avatar">
                {current.avatar && !current.avatar.endsWith("/@jpeg") ? (
                  <img
                    key={current.avatar}
                    src={current.avatar}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <Glyph kind="user" />
              </span>
              <span className="rs-story-handle">
                @{current.handle.replace(/^@/, "")}
              </span>
              <span className="rs-story-time">
                {dayjs.utc(current.createdAt).local().fromNow()}
              </span>
            </button>
            <button
              className="rs-story-close"
              aria-label="Close story"
              onClick={props.onClose}
            >
              <Glyph kind="close" />
            </button>
          </header>
          <div className="rs-story-art-area">
            <button
              className="rs-story-tap rs-story-prev"
              aria-label="Previous story"
              onClick={previous}
            />
            <button
              className="rs-story-tap rs-story-next"
              aria-label="Next story"
              onClick={next}
            />
            <div className="rs-story-cover">
              <button
                className="rs-story-cover-link"
                aria-label={`Open ${current.title}`}
                onClick={() => navigate(storyPath(current.trackUri))}
                disabled={!storyPath(current.trackUri)}
              >
                <span className="rs-story-art-placeholder">♪</span>
                {current.albumArt && (
                  <img
                    key={current.albumArt}
                    src={current.albumArt}
                    alt={current.title}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </button>
              <div className="rs-story-gradient">
                <button
                  className="rs-story-heart"
                  aria-label={liked ? "Unlike track" : "Like track"}
                  aria-pressed={liked}
                  disabled={
                    likePending || (!current.trackUri && !current.trackId)
                  }
                  onClick={() => void toggleLike()}
                  style={{ color: liked ? "#ff2876" : "rgba(255,255,255,.9)" }}
                >
                  <Glyph kind="heart" filled={liked} />
                  {count > 0 && <span>{count}</span>}
                </button>
              </div>
            </div>
          </div>
          <div className="rs-story-info">
            <Marquee
              key={key}
              title={current.title}
              paused={paused}
              onClick={
                storyPath(current.trackUri)
                  ? () => navigate(storyPath(current.trackUri))
                  : undefined
              }
            />
            <button
              className="rs-story-artist"
              disabled={!storyPath(current.artistUri)}
              onClick={() => navigate(storyPath(current.artistUri))}
            >
              {current.artist}
            </button>
            <div className="rs-story-links">
              {links.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rs-story-circle"
                  aria-label={`Open in ${link.name}`}
                >
                  {link.name === "Spotify" ? (
                    <svg
                      width="25"
                      height="25"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="12" fill="#1DB954" />
                      <path
                        d="M5 8.4c4.5-1.4 9-1 14 1.1M6 12c4-1.1 8-.7 12 1.1M7 15.5c3-.7 6-.5 9 1"
                        fill="none"
                        stroke="#102219"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <img
                      src={logos[link.name]}
                      alt=""
                      style={
                        link.name === "Discogs"
                          ? { filter: "brightness(0) invert(1)" }
                          : undefined
                      }
                    />
                  )}
                </a>
              ))}
              <button
                className="rs-story-circle"
                aria-label="Share this story"
                onClick={() => void share()}
              >
                <Glyph kind="share" />
              </button>
            </div>
          </div>
          <button
            className="rs-story-shout"
            disabled={!shoutUri(current)}
            onClick={openComposer}
          >
            <Glyph kind="shout" />
            Add a shout
          </button>
        </div>
        {!!status && (
          <div className="rs-story-status" role="status">
            {status}
          </div>
        )}
        {composer && (
          <form
            className="rs-story-composer"
            onSubmit={async (e) => {
              e.preventDefault();
              const uri = shoutUri(current);
              if (!uri || !message.trim() || posting) return;
              setPosting(true);
              try {
                await props.onPostShout(uri, message.trim());
                setMessage("");
                setComposer(false);
                setStatus("Shout posted");
              } catch {
                setStatus("Could not post your shout. Please try again.");
              } finally {
                setPosting(false);
              }
            }}
          >
            <div>
              <strong>Add a shout</strong>
              <button
                type="button"
                className="rs-story-close"
                aria-label="Close shout composer"
                disabled={posting}
                onClick={() => setComposer(false)}
              >
                <Glyph kind="close" />
              </button>
            </div>
            <textarea
              autoFocus
              aria-label="Your shout"
              placeholder="Write a shout…"
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button
              className="rs-story-post"
              type="submit"
              disabled={posting || !message.trim()}
            >
              {posting ? "Posting…" : "Post shout"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
