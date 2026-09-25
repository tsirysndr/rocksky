import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Button,
  Chip,
  Skeleton,
  Switch,
  Label,
  buttonVariants,
} from "@heroui/react";
import { useAtom } from "jotai";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  ChartNoAxesCombined,
  Check,
  Copy,
  Disc3,
  Code2,
  Upload,
  Server,
  Search,
  Globe2,
  Headphones,
  Menu,
  Music2,
  Radio,
  Users,
  X,
} from "lucide-react";
import type { ScrobbleViewBasic } from "@rocksky/sdk";
import {
  appUrl,
  liveAtom,
  menuAtom,
  relativeTime,
  trackUrl,
  useCommunity,
} from "./data";
import SearchModal, { searchOpenAtom } from "./SearchModal";
import LoginScreen from "./LoginScreen";
import { authUrl } from "./auth";
import { ATPASSPORT_CALLBACK_PATH } from "../../shared/homepage-routing";

const createAccountUrl = authUrl(
  import.meta.env.VITE_ROCKSKY_AUTH_URL || "https://rocksky.pages.dev/loading",
);

function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Brand() {
  return (
    <a href="#" className="brand" aria-label="Rocksky home">
      <span>Rocksky</span>
    </a>
  );
}

function NightStars() {
  return (
    <div className="night-stars" aria-hidden="true">
      {Array.from({ length: 64 }, (_, index) => (
        <span
          key={index}
          className="night-star"
          style={{
            left: `${(index * 61.803 + 3) % 100}%`,
            top: `${(index * 37.719 + 7) % 100}%`,
            width: index % 7 === 0 ? 2 : 1,
            height: index % 7 === 0 ? 2 : 1,
            animationDelay: `${-(index % 13)}s`,
            animationDuration: `${5 + (index % 6)}s`,
          }}
        />
      ))}
    </div>
  );
}

function Artwork({
  src,
  title,
  className = "",
}: {
  src?: string;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`artwork ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={title}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Disc3 aria-label={title} />
      )}
    </div>
  );
}

function Scrobble({
  track,
  index,
}: {
  track: ScrobbleViewBasic;
  index: number;
}) {
  const href = trackUrl(track.trackUri);
  const Row = href ? "a" : "div";
  return (
    <Row className="scrobble-row" href={href}>
      <span className="track-number">{String(index + 1).padStart(2, "0")}</span>
      <Artwork
        src={track.albumArt}
        title={`${track.album || track.title || "Album"} artwork`}
      />
      <div className="track-title">
        <strong>{track.title || "Untitled track"}</strong>
        <span>{track.artist || "Unknown artist"}</span>
      </div>
      <span className="listener">
        {track.handle ? `@${track.handle}` : "A Rocksky listener"}
      </span>
      <time dateTime={track.createdAt}>{relativeTime(track.createdAt)}</time>
      <ArrowUpRight size={17} className="row-arrow" aria-hidden="true" />
    </Row>
  );
}

function InstallCommand({
  command,
  label,
}: {
  command: string;
  label: string;
}) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  );

  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copyCommand() {
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(command);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="player-install">
      <span>{label}</span>
      <div className="player-install-command">
        <code>{command}</code>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          className="player-install-copy"
          aria-label={
            status === "copied" ? "Command copied" : `Copy command: ${command}`
          }
          isDisabled={status === "copying"}
          onPress={() => void copyCommand()}
        >
          {status === "copied" ? <Check size={17} /> : <Copy size={17} />}
        </Button>
      </div>
      <p
        role="status"
        className={status === "error" ? "player-install-error" : "sr-only"}
      >
        {status === "copied"
          ? "Command copied to clipboard."
          : status === "error"
            ? "Couldn’t copy. Select the command and copy it manually."
            : ""}
      </p>
    </div>
  );
}

function LandingPage() {
  const [, setSearchOpen] = useAtom(searchOpenAtom);
  const { stats, feed, live } = useCommunity();
  const [, setLive] = useAtom(liveAtom);
  const [menu, setMenu] = useAtom(menuAtom);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const rotate = useTransform(scrollY, [0, 1000], [-15, 30]);
  const y = useTransform(scrollY, [0, 900], [0, 95]);
  const tracks = feed.data ?? [];
  const featured = tracks.find((track) => track.albumArt) ?? tracks[0];
  const featuredUrl = trackUrl(featured?.trackUri);
  const RecentCard = featuredUrl ? "a" : "div";
  const covers = [
    ...new Map(
      tracks
        .filter((track) => track.albumArt)
        .map((track) => [track.albumArt, track]),
    ).values(),
  ].slice(0, 4);
  const status = !live
    ? "Updates paused"
    : feed.isError
      ? feed.data
        ? "Reconnecting"
        : "Feed unavailable"
      : feed.fetchStatus === "paused"
        ? "Offline"
        : feed.isPending
          ? "Connecting"
          : "Recent activity";

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [setMenu]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container nav-bar">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            <a href="#discover">Discover</a>
            <a href="#community">Community</a>
            <a href="#how-it-works">How it works</a>
            <a
              href="https://docs.rocksky.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </a>
          </nav>
          <div className="nav-actions">
            <Button
              isIconOnly
              variant="ghost"
              className="search-trigger"
              aria-label="Search Rocksky"
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+k Control+k /"
              aria-description="Press Command K, Control K, or slash to search"
              onPress={() => {
                setMenu(false);
                setSearchOpen(true);
              }}
            >
              <Search size={20} />
            </Button>
            <div className="nav-auth-links">
              <a className="login-link" href="#sign-in">
                Sign in
              </a>
              <span aria-hidden="true">/</span>
              <a
                className="login-link create-account-link"
                href={createAccountUrl}
              >
                Create account
              </a>
            </div>
            <Button
              isIconOnly
              variant="ghost"
              className="mobile-toggle"
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              aria-controls="mobile-nav"
              onPress={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {menu && (
          <nav
            id="mobile-nav"
            aria-label="Mobile navigation"
            className="mobile-nav"
          >
            {[
              ["Discover", "#discover"],
              ["Community", "#community"],
              ["How it works", "#how-it-works"],
              ["Docs", "https://docs.rocksky.app"],
              ["Sign in", "#sign-in"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                target={label === "Docs" ? "_blank" : undefined}
                rel={label === "Docs" ? "noopener noreferrer" : undefined}
                onClick={() => setMenu(false)}
              >
                {label}
                <ArrowUpRight size={18} />
              </a>
            ))}
          </nav>
        )}
      </header>
      <SearchModal />

      <main id="main">
        <section className="hero container" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="tiny-star">✳</span> MUSIC SCROBBLING ON AT
              PROTOCOL
            </div>
            <h1 id="hero-title">
              A record of
              <br />
              what you
              <br />
              <span className="pink-word">
                listen to.
                <svg
                  viewBox="0 0 460 25"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d="M5 18 Q205 -3 451 10 M48 23 Q267 8 408 16" />
                </svg>
              </span>
            </h1>
            <p className="hero-description">
              Track what you play, see your listening stats, and find music
              through other listeners. Rocksky keeps your listening history
              together across the services you connect.
            </p>
            <div className="hero-actions">
              <a
                href="#sign-in"
                className={
                  buttonVariants({ size: "lg" }) + " cta-link main-cta"
                }
              >
                Start scrobbling <ArrowUpRight size={18} />
              </a>
              <a href="#community" className="text-link">
                Recent listens <ArrowDown size={17} />
              </a>
            </div>
            <p className="hero-note">
              <Check size={14} /> Free to join <span>·</span>{" "}
              <a
                href="https://tangled.org/rocksky.app/rocksky"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Open source
              </a>{" "}
              <span>·</span>{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Built on AT Protocol
              </a>
            </p>
          </div>

          <div className="hero-art" aria-label="Rocksky record illustration">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="art-star star-one" aria-hidden="true">
              ✦
            </span>
            <span className="art-star star-two" aria-hidden="true">
              ✳
            </span>
            <span className="vertical-caption">
              ROCKSKY / LISTENING HISTORY
            </span>
            <motion.div
              className="record-sleeve"
              style={reduce ? undefined : { rotate, y }}
            >
              <div className="sleeve-top">
                <AudioLines size={24} />
                <span>
                  LISTENING
                  <br />
                  HISTORY.
                </span>
                <span className="sleeve-edition">
                  VOL.
                  <br />
                  001
                </span>
              </div>
              <div className="vinyl">
                <div className="vinyl-label">
                  <AudioLines size={38} />
                  <span>rocksky</span>
                  <div className="spindle" />
                  <small>SIDE A</small>
                </div>
              </div>
              <div className="sleeve-bottom">
                <span>ROCKSKY RECORDS</span>
                <span>33⅓ RPM ↗</span>
              </div>
            </motion.div>
            <div className="floating-tag">
              <span className="live-dot" /> WHAT’S ON YOUR ROTATION?
            </div>
            <RecentCard
              className="now-card"
              href={featuredUrl}
              aria-label={
                featuredUrl && featured
                  ? `View ${featured.title || "song"} by ${featured.artist || "unknown artist"} on Rocksky`
                  : undefined
              }
            >
              <div className="now-card-label">
                <span className="equalizer">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                {featured ? "A RECENT COMMUNITY LISTEN" : "RECENT LISTENS"}
              </div>
              <div className="now-card-track">
                <Artwork
                  src={featured?.albumArt}
                  title={featured?.album || "Record artwork"}
                />
                <div>
                  <strong>{featured?.title || "No recent listens yet"}</strong>
                  <span>
                    {featured?.artist ||
                      "Tracks from Rocksky listeners appear here"}
                  </span>
                </div>
                <Music2 size={21} />
              </div>
            </RecentCard>
          </div>
          <div className="hero-bottom">
            <span>SCROBBLES, STATS & MUSIC</span>
            <a href="#discover" aria-label="Explore Rocksky">
              <ArrowDown size={19} />
            </a>
            <span>FROM YOUR FIRST SCROBBLE ON</span>
          </div>
        </section>

        <section
          className="stats-band"
          aria-label="Rocksky community statistics"
        >
          <div className="container stats-grid">
            <div className="stats-intro">
              <span className="live-dot" />
              <span>
                On Rocksky
                <br />
                <strong>so far.</strong>
              </span>
            </div>
            {(
              [
                ["scrobbles", "scrobbles"],
                ["artists", "artists"],
                ["users", "listeners"],
              ] as const
            ).map(([key, label]) => (
              <div className="stat" key={key}>
                {stats.isPending ? (
                  <Skeleton className="h-10 w-28 rounded-lg" />
                ) : (
                  <strong>
                    {stats.data?.[key] != null
                      ? new Intl.NumberFormat("en", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(stats.data[key])
                      : "—"}
                  </strong>
                )}
                <span>{label}</span>
              </div>
            ))}
            {stats.isError && (
              <div className="stats-error" role="status">
                {stats.data
                  ? "Showing last available stats."
                  : "Stats are temporarily unavailable."}{" "}
                <button onClick={() => void stats.refetch()}>Try again</button>
              </div>
            )}
          </div>
        </section>

        <section
          id="discover"
          className="container discover-section section-space"
        >
          <Reveal className="section-heading">
            <div>
              <div className="eyebrow">01 / YOUR LISTENING HISTORY</div>
              <h2>
                What was that song
                <br />
                <span className="muted-heading">you played all week?</span>
              </h2>
            </div>
            <p>
              Look up an old favorite, check your most-played albums, or see
              what your friends have been listening to.
            </p>
          </Reveal>
          <div className="feature-grid">
            <Reveal className="feature-card feature-history">
              <div className="feature-icon">
                <ChartNoAxesCombined size={23} />
              </div>
              <h3>See what you play most</h3>
              <p>
                Compare your top artists, albums, and songs over time. Find out
                just how often you’ve played that one record.
              </p>
              <div className="listening-art" aria-hidden="true">
                <div className="chart-caption">
                  <span>LISTENING ACTIVITY</span>
                  <AudioLines size={18} />
                </div>
                <div className="bars">
                  {[
                    26, 43, 37, 68, 49, 83, 61, 45, 75, 93, 65, 100, 78, 56, 86,
                    68, 91, 73, 52, 80, 95, 72, 60, 88,
                  ].map((height, index) => (
                    <div
                      key={index}
                      style={{
                        height: `${height}%`,
                        animationDelay: `${index * 35}ms`,
                      }}
                    />
                  ))}
                </div>
                <div className="chart-days">
                  <span>EARLIER</span>
                  <span>MORE RECENT ↗</span>
                </div>
              </div>
            </Reveal>
            <Reveal className="feature-card feature-discovery">
              <div className="feature-icon">
                <Disc3 size={23} />
              </div>
              <h3>Find something to listen to</h3>
              <p>
                Browse the songs and albums people are playing on Rocksky. Start
                with a familiar artist and see what else turns up.
              </p>
              <div className="cover-stack" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <div
                    className={`mini-sleeve mini-sleeve-${index}`}
                    key={index}
                  >
                    {covers[index] ? (
                      <img
                        src={covers[index].albumArt}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <>
                        <Disc3 />
                        <span>{["SIDE A", "ON REPEAT", "SIDE B"][index]}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal className="feature-card feature-social">
              <div className="feature-icon">
                <Users size={23} />
              </div>
              <h3>Follow other listeners</h3>
              <p>
                Found someone with good taste? Follow them to keep up with what
                they’re playing.
              </p>
              <div className="community-art" aria-hidden="true">
                <div className="community-ring" />
                <div className="community-center">
                  <AudioLines size={33} />
                </div>
                {["♪", "♫", "✳", "♥"].map((icon, index) => (
                  <span className={`music-person person-${index}`} key={icon}>
                    {icon}
                  </span>
                ))}
              </div>
              <span className="feature-footnote">
                SEE WHAT YOUR FRIENDS ARE PLAYING
              </span>
            </Reveal>
          </div>
        </section>

        <section id="community" className="community-section section-space">
          <div className="container">
            <Reveal className="section-heading">
              <div>
                <div className="eyebrow">
                  <span className="live-dot" /> 02 / RECENT SCROBBLES
                </div>
                <h2>
                  What people
                  <br />
                  <span className="muted-heading">are listening to.</span>
                </h2>
              </div>
            </Reveal>
            <Reveal className="feed-panel">
              <div className="feed-header">
                <div>
                  <Radio size={20} />
                  <h3>Recently scrobbled</h3>
                  <Chip size="sm" variant="soft" className="live-chip">
                    {status}
                  </Chip>
                </div>
                <Switch
                  size="sm"
                  isSelected={live}
                  onChange={setLive}
                  aria-label="Automatically refresh community activity"
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Label className="refresh-label">Auto-refresh</Label>
                  </Switch.Content>
                </Switch>
              </div>
              {feed.isPending ? (
                <div
                  className="feed-loading"
                  aria-label="Loading recent scrobbles"
                  aria-busy="true"
                >
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div className="skeleton-row" key={i}>
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <Skeleton className="h-5 w-2/5 rounded-lg" />
                      <Skeleton className="ml-auto h-4 w-20 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : tracks.length > 0 ? (
                <div className="feed-list">
                  {tracks.slice(0, 6).map((track, index) => (
                    <Scrobble
                      key={
                        track.id ||
                        track.uri ||
                        `${track.did}-${track.createdAt}-${index}`
                      }
                      track={track}
                      index={index}
                    />
                  ))}
                </div>
              ) : (
                <div className="feed-empty">
                  <Headphones size={36} />
                  <h3>
                    {feed.isError
                      ? "Couldn’t load recent listens"
                      : "No recent listens yet"}
                  </h3>
                  <p>
                    {feed.isError
                      ? "The feed isn’t available right now. Try again in a moment."
                      : "Scrobbles from Rocksky listeners will appear here."}
                  </p>
                  {feed.isError ? (
                    <Button
                      variant="outline"
                      onPress={() => void feed.refetch()}
                    >
                      Try again
                    </Button>
                  ) : (
                    <a
                      href="#sign-in"
                      className={
                        buttonVariants({ size: "lg" }) + " cta-link join-button"
                      }
                    >
                      Start scrobbling <ArrowUpRight size={18} />
                    </a>
                  )}
                </div>
              )}
              <div className="feed-footer">
                <span role="status">
                  {feed.isError && tracks.length
                    ? "Connection interrupted · showing the last available listens"
                    : live
                      ? "A scrobble records the song you played and when you played it."
                      : "Updates paused. Switch on auto-refresh to catch up."}
                </span>
                <span>
                  RECENT LISTENS <Music2 size={14} />
                </span>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          id="how-it-works"
          className="container how-section section-space"
        >
          <Reveal className="how-intro">
            <div className="eyebrow">03 / GETTING STARTED</div>
            <h2>
              Keep using
              <br />
              <span className="muted-heading">the players you like.</span>
            </h2>
            <p>
              Connect a music service or scrobbler to start saving your listens.
            </p>
            <div className="service-tags">
              <span>
                <img src={`${import.meta.env.BASE_URL}spotify.svg`} alt="" />{" "}
                Spotify
              </span>
              <span>
                <Globe2 size={17} /> Web Scrobbler
              </span>
              <span>
                <Music2 size={17} /> Pano Scrobbler
              </span>
              <span>
                <Headphones size={17} /> Navidrome
              </span>
              <span>
                <Music2 size={17} /> Jellyfin
              </span>
            </div>
            <a
              className="text-link"
              href="https://docs.rocksky.app/quickstart"
              target="_blank"
              rel="noopener noreferrer"
            >
              Connect your music <ArrowRight size={18} />
            </a>
          </Reveal>
          <Reveal className="steps">
            {[
              {
                title: "Sign in to Rocksky",
                text: "Use your Atmosphere Account. A Bluesky handle works here too.",
              },
              {
                title: "Connect a music source",
                text: "Choose a supported service, player, or scrobbler in the setup guide.",
              },
              {
                title: "Play some music",
                text: "Your listens appear on your profile and count toward your listening stats.",
              },
            ].map((step, i) => (
              <div className="step" key={step.title}>
                <span className="step-number">0{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </Reveal>
        </section>

        <section
          id="bring-your-history"
          className="container import-section section-space"
        >
          <Reveal className="section-heading">
            <div>
              <div className="eyebrow">04 / MIRRORS & IMPORTS</div>
              <h2>
                Already have years
                <br />
                <span className="muted-heading">of listening history?</span>
              </h2>
            </div>
            <p>
              Import your old scrobbles and keep new ones coming in from Last.fm
              or ListenBrainz.
            </p>
          </Reveal>
          <div className="import-grid">
            <Reveal className="integration-card mirror-card">
              <span className="integration-kicker">MIRROR NEW SCROBBLES</span>
              <div className="integration-logos">
                <span className="platform-badge">
                  <img src={`${import.meta.env.BASE_URL}lastfm.svg`} alt="" />
                  <span>Last.fm</span>
                </span>
                <span className="platform-badge listenbrainz-badge">
                  <img
                    src={`${import.meta.env.BASE_URL}listenbrainz.svg`}
                    alt="ListenBrainz"
                  />
                </span>
                <ArrowRight size={22} aria-hidden="true" />
                <img
                  className="rocksky-integration-icon"
                  src={`${import.meta.env.BASE_URL}favicon.png`}
                  width={34}
                  height={34}
                  alt="Rocksky"
                />
              </div>
              <h3>Keep your current scrobbler</h3>
              <p>
                Set up a Last.fm or ListenBrainz mirror to copy new scrobbles
                into Rocksky. You can keep using your existing setup.
              </p>
              <a
                className="text-link"
                href="https://docs.rocksky.app/mirroring/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                Set up a mirror <ArrowUpRight size={18} />
              </a>
              <span className="integration-detail">
                <Check size={14} /> Last.fm & ListenBrainz mirrors
              </span>
            </Reveal>
            <Reveal className="integration-card history-card">
              <span className="integration-kicker">IMPORT PAST LISTENS</span>
              <div className="integration-logos">
                <span className="platform-badge">
                  <img src={`${import.meta.env.BASE_URL}spotify.svg`} alt="" />
                  <span>Spotify</span>
                </span>
                <span className="platform-badge">
                  <img src={`${import.meta.env.BASE_URL}lastfm.svg`} alt="" />
                  <span>Last.fm</span>
                </span>
              </div>
              <h3>Bring your old listens over</h3>
              <p>
                Import a Spotify listening-history export or your Last.fm
                scrobbles, even if they go back a decade. The import guide walks
                you through the files you’ll need.
              </p>
              <a
                className="text-link"
                href="https://docs.rocksky.app/cli/import"
                target="_blank"
                rel="noopener noreferrer"
              >
                Import your listening history <ArrowUpRight size={18} />
              </a>
              <span className="integration-detail">
                <Check size={14} /> Spotify JSON & Last.fm CSV exports
              </span>
            </Reveal>
          </div>
        </section>

        <section
          id="your-library"
          className="container library-section section-space"
        >
          <Reveal className="section-heading">
            <div>
              <div className="eyebrow">05 / YOUR LIBRARY & THE SDK</div>
              <h2>
                Have your own music?
                <br />
                <span className="muted-heading">Upload your library.</span>
              </h2>
            </div>
            <a
              className="text-link"
              href="https://docs.rocksky.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the docs <ArrowUpRight size={18} />
            </a>
          </Reveal>
          <div className="platform-grid">
            <Reveal className="platform-card">
              <Upload size={28} />
              <span className="integration-kicker">MUSIC FILES</span>
              <h3>Keep your collection on Rocksky</h3>
              <p>
                Upload the albums and tracks you own, including music you won’t
                find on streaming services. Listen from your Rocksky library.
              </p>
              <a
                className="text-link"
                href="https://docs.rocksky.app/integrations/navidrome-server#step-1-upload-music"
                target="_blank"
                rel="noopener noreferrer"
              >
                Upload your music <ArrowUpRight size={18} />
              </a>
            </Reveal>
            <Reveal className="platform-card">
              <Server size={28} />
              <span className="integration-kicker">
                NAVIDROME-COMPATIBLE API
              </span>
              <h3>Connect your music player</h3>
              <p>
                Rocksky provides a Navidrome-compatible API for your uploaded
                library. Use it with a compatible Subsonic or Navidrome client
                to browse and play your music.
              </p>
              <a
                className="text-link"
                href="https://docs.rocksky.app/integrations/navidrome-server"
                target="_blank"
                rel="noopener noreferrer"
              >
                Connect your player <ArrowUpRight size={18} />
              </a>
            </Reveal>
            <Reveal className="platform-card sdk-card">
              <Code2 size={28} />
              <span className="integration-kicker">ROCKSKY SDK</span>
              <h3>Build your own integration</h3>
              <p>
                Use the Rocksky SDK to submit scrobbles, read listening stats,
                or build a music app. Get started with the TypeScript package
                and examples in the docs.
              </p>
              <div className="sdk-package">
                <span>TypeScript</span>
                <code>@rocksky/sdk</code>
              </div>
              <a
                className="text-link"
                href="https://docs.rocksky.app/sdks/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the SDK docs <ArrowUpRight size={18} />
              </a>
            </Reveal>
          </div>
        </section>

        <section
          id="music-player"
          className="container player-section section-space"
          aria-labelledby="player-title"
        >
          <Reveal className="section-heading player-heading">
            <div>
              <div className="eyebrow">06 / MUSIC-PLAYER</div>
              <h2 id="player-title">
                A desktop player.
                <br />
                <span className="muted-heading">Rocksky built in.</span>
              </h2>
            </div>
            <div className="player-intro">
              <p>
                Play your local files or stream from Navidrome, Subsonic, and
                Jellyfin with music-player. Connect your Rocksky account and
                enable scrobbling to save your listens as you play.
              </p>
              <div className="player-actions">
                <a
                  href="https://github.com/tsirysndr/music-player#installation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ size: "lg" }) + " cta-link"}
                >
                  Get music-player <ArrowUpRight size={18} />
                </a>
                <a
                  className="text-link"
                  href="https://github.com/tsirysndr/music-player#rocksky-scrobbling"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Set up scrobbling <ArrowRight size={17} />
                </a>
              </div>
              <InstallCommand
                label="Install with Homebrew"
                command="brew install --cask tsirysndr/tap/musicplayer"
              />
            </div>
          </Reveal>
          <Reveal className="player-showcase">
            <figure className="player-figure">
              <img
                src={`${import.meta.env.BASE_URL}music-player.png`}
                width={2840}
                height={1720}
                loading="lazy"
                decoding="async"
                alt="The music-player desktop app showing an album library, sidebar, and playback controls in its dark Synthwave theme"
              />
              <figcaption>
                <span>music-player / desktop</span>
                <span>
                  <Check size={14} aria-hidden="true" /> Built-in Rocksky
                  scrobbling
                </span>
              </figcaption>
            </figure>
          </Reveal>
        </section>

        <section
          id="playerd"
          className="container playerd-section section-space"
          aria-labelledby="playerd-title"
        >
          <Reveal className="section-heading player-heading">
            <div>
              <div className="eyebrow">07 / @ROCKSKY/PLAYERD</div>
              <h2 id="playerd-title">
                Music on your Raspberry Pi.
                <br />
                <span className="muted-heading">Control it from Rocksky.</span>
              </h2>
            </div>
            <div className="player-intro">
              <p>
                @rocksky/playerd is Rocksky’s official headless music player.
                Run it on a Raspberry Pi or another single-board computer
                connected to your speakers. It needs no GUI: choose the device
                in Rocksky Web to play music, manage the queue, and adjust the
                volume.
              </p>
              <InstallCommand
                label="Install with Bun"
                command="bun install -g @rocksky/playerd"
              />
              <a
                className="text-link playerd-source"
                href="https://tangled.org/rocksky.app/rocksky/tree/main/playerd"
                target="_blank"
                rel="noopener noreferrer"
              >
                View the source on Tangled <ArrowUpRight size={17} />
              </a>
            </div>
          </Reveal>
          <Reveal className="playerd-steps">
            <div>
              <span className="step-number">01</span>
              <h3>Sign in on the device</h3>
              <p>Use the Rocksky CLI to connect your account.</p>
              <code>rocksky login</code>
            </div>
            <div>
              <span className="step-number">02</span>
              <h3>Start your player</h3>
              <p>Give it a name you’ll recognize in the device list.</p>
              <code>playerd --name "Living Room"</code>
            </div>
            <div>
              <span className="step-number">03</span>
              <h3>Open Rocksky Web</h3>
              <p>
                Select your player in the device picker and send it some music.
                Playback happens on the device, with built-in scrobbling.
              </p>
            </div>
          </Reveal>
          <Reveal className="playerd-preview">
            <figure className="player-figure">
              <img
                src={`${import.meta.env.BASE_URL}playerd.png`}
                width={2346}
                height={518}
                loading="lazy"
                decoding="async"
                alt="Rocksky Web playback controls with an Orange Pi Zero 3W selected in the device picker"
              />
              <figcaption>
                <span>Rocksky Web / remote playback</span>
                <span>
                  <Server size={14} aria-hidden="true" /> No screen needed on
                  your player
                </span>
              </figcaption>
            </figure>
          </Reveal>
        </section>

        <section className="container">
          <Reveal className="closing-section">
            <span className="closing-star" aria-hidden="true">
              ✳
            </span>
            <div className="eyebrow">START YOUR LISTENING HISTORY</div>
            <h2>
              What are you
              <br />
              listening to <em>today?</em>
            </h2>
            <p>
              <a
                href="https://tangled.org/rocksky.app/rocksky"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Open source
              </a>
              .{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Built on AT Protocol
              </a>
              .
              <br />
              Sign in, connect your player, and start scrobbling.
            </p>
            <a
              href="#sign-in"
              className={
                buttonVariants({ size: "lg" }) + " cta-link closing-cta"
              }
            >
              Start scrobbling <ArrowUpRight size={18} />
            </a>
          </Reveal>
        </section>
      </main>
      <footer className="container site-footer">
        <div>
          <Brand />
          <p>Music scrobbling on AT Protocol.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a
            href="https://docs.rocksky.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a
            href="https://tangled.org/rocksky.app/rocksky"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={`${import.meta.env.BASE_URL}tangled.svg`}
              width={20}
              height={20}
              alt=""
            />{" "}
            Tangled
          </a>
          <a href={`${appUrl}/tos`}>Terms</a>
          <a
            href="https://bsky.app/profile/rocksky.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Bluesky <ArrowUpRight size={15} />
          </a>
        </nav>
        <span className="footer-note">THANKS FOR LISTENING.</span>
        <p className="footer-credit">
          Baked with <span>♥</span> in Antananarivo © 2026 Rocksky
        </p>
      </footer>
    </>
  );
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export default function App() {
  const isLogin = useSyncExternalStore(
    subscribeToLocation,
    () =>
      window.location.hash === "#sign-in" ||
      window.location.pathname === ATPASSPORT_CALLBACK_PATH,
    () => false,
  );
  return (
    <>
      <NightStars />
      {isLogin ? <LoginScreen /> : <LandingPage />}
    </>
  );
}
