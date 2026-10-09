import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const slides = [
  {
    label: "YOUR LISTENING STORY",
    title: "Every listen tells a story",
    description:
      "Track your listening and explore the artists, albums, and songs you return to most.",
  },
  {
    label: "YOUR MUSIC, TOGETHER",
    title: "Make room for your music",
    description:
      "Play your own music, build playlists, and connect the music services you love.",
  },
  {
    label: "BETTER WITH FRIENDS",
    title: "Find your kind of music people",
    description:
      "Follow friends, discover what they’re listening to, and share your favorites.",
  },
  {
    label: "FROM HEADPHONES TO LIVE",
    title: "Be there for the next show",
    description:
      "Explore upcoming concerts from your favorite artists. Mark yourself going or interested.",
  },
];

// Colorful artwork sits directly on the app background.
const palettes = [
  {
    ink: "#233E38",
    card: "#FFFBF3",
    raised: "#E0E8D9",
    accent: "#D95232",
    secondary: "#50755C",
    highlight: "#DCA83D",
    muted: "#839484",
    border: "#C2CEB9",
  },
  {
    ink: "#203A58",
    card: "#F7FBFF",
    raised: "#C7DCF0",
    accent: "#275EC7",
    secondary: "#507EB8",
    highlight: "#F4BA55",
    muted: "#829DB8",
    border: "#AEC5DE",
  },
  {
    ink: "#26473D",
    card: "#FAFBEF",
    raised: "#CBDDC4",
    accent: "#B94732",
    secondary: "#467365",
    highlight: "#EAC363",
    muted: "#829B7C",
    border: "#B1C9AB",
  },
  {
    ink: "#542F36",
    card: "#FFF7EA",
    raised: "#EACBC4",
    accent: "#B73E51",
    secondary: "#9B666C",
    highlight: "#E4AA43",
    muted: "#B18C89",
    border: "#D5AAA5",
  },
];
function Illustration({ page }: { page: number }) {
  const paint = palettes[page];
  return (
    <div className="login-tour-art" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 320 180">
        <circle cx={160} cy={90} r={78} fill={paint.secondary} opacity={0.1} />
        <circle
          cx={160}
          cy={90}
          r={63}
          fill="none"
          stroke={paint.secondary}
          strokeOpacity={0.25}
        />
        <circle cx={44} cy={54} r={4} fill={paint.accent} />
        <circle cx={279} cy={131} r={3} fill={paint.highlight} />
        <path
          d="M270 32v12m-6-6h12M42 133v10m-5-5h10"
          stroke={paint.accent}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {page === 0 && (
          <>
            <g transform="rotate(-8 112 88)">
              <rect
                x={56}
                y={25}
                width={116}
                height={128}
                rx={14}
                fill={paint.card}
                stroke={paint.border}
              />
              <circle cx={114} cy={77} r={34} fill={paint.secondary} />
              <circle
                cx={114}
                cy={77}
                r={23}
                fill="none"
                stroke={paint.ink}
                strokeOpacity={0.22}
              />
              <circle cx={114} cy={77} r={12} fill={paint.ink} />
              <circle cx={114} cy={77} r={4} fill={paint.accent} />
              <rect
                x={73}
                y={122}
                width={63}
                height={5}
                rx={2.5}
                fill={paint.ink}
              />
              <rect
                x={73}
                y={133}
                width={42}
                height={4}
                rx={2}
                fill={paint.muted}
              />
            </g>
            <rect
              x={157}
              y={64}
              width={113}
              height={97}
              rx={12}
              fill={paint.raised}
              stroke={paint.secondary}
              strokeOpacity={0.4}
            />
            <path
              d="M174 86h35"
              stroke={paint.ink}
              strokeWidth={5}
              strokeLinecap="round"
            />
            {[20, 33, 26, 46, 38, 56].map((height, index) => (
              <rect
                key={height}
                x={174 + index * 13}
                y={145 - height}
                width={8}
                height={height}
                rx={3}
                fill={height === 56 ? paint.highlight : paint.accent}
              />
            ))}
            <circle cx={235} cy={40} r={18} fill={paint.accent} />
            <path
              d="m227 40 6 6 11-12"
              stroke="white"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}
        {page === 1 && (
          <>
            <g transform="rotate(-12 104 92)">
              <rect
                x={55}
                y={39}
                width={94}
                height={112}
                rx={12}
                fill={paint.secondary}
              />
              <path
                d="M55 125 96 55l53 96H55"
                fill={paint.accent}
                opacity={0.75}
              />
              <circle cx={119} cy={64} r={14} fill={paint.highlight} />
            </g>
            <g transform="rotate(9 214 91)">
              <rect
                x={174}
                y={32}
                width={85}
                height={112}
                rx={12}
                fill={paint.raised}
                stroke={paint.border}
              />
              <circle cx={215} cy={80} r={28} fill={paint.accent} />
              <circle cx={215} cy={80} r={12} fill={paint.raised} />
              <path
                d="M190 121h43"
                stroke={paint.ink}
                strokeWidth={4}
                strokeLinecap="round"
              />
            </g>
            <rect
              x={111}
              y={21}
              width={98}
              height={143}
              rx={15}
              fill={paint.card}
              stroke={paint.secondary}
            />
            <rect
              x={124}
              y={34}
              width={72}
              height={71}
              rx={8}
              fill={paint.secondary}
            />
            <path
              d="M133 84V61m9 34V47m9 44V57m9 38V43m9 44V54m9 28V61m9 18V67"
              stroke={paint.ink}
              strokeWidth={4}
              strokeLinecap="round"
            />
            <path
              d="M125 118h70"
              stroke={paint.border}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <path
              d="M125 118h40"
              stroke={paint.accent}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle cx={160} cy={140} r={14} fill={paint.accent} />
            <path d="m157 134 8 6-8 6Z" fill="white" />
            <path
              d="m132 137-5 3 5 3m55-6 5 3-5 3"
              stroke={paint.ink}
              strokeWidth={2}
              fill="none"
            />
          </>
        )}
        {page === 2 && (
          <>
            <path
              d="m90 57 66 40 79-41M90 57l-9 74 75-34 83 41-4-82"
              stroke={paint.secondary}
              strokeWidth={2}
              strokeDasharray="5 6"
              fill="none"
            />
            {[
              { x: 83, y: 48, color: paint.secondary },
              { x: 239, y: 52, color: paint.accent },
              { x: 79, y: 135, color: paint.accent },
              { x: 244, y: 135, color: paint.secondary },
            ].map(({ x, y, color }) => (
              <g key={x}>
                <circle
                  cx={x}
                  cy={y}
                  r={25}
                  fill={paint.card}
                  stroke={color}
                  strokeWidth={2}
                />
                <circle cx={x} cy={y - 6} r={8} fill={color} />
                <path
                  d={`M${x - 14} ${y + 15}q0-17 14-17t14 17`}
                  fill={color}
                />
              </g>
            ))}
            <rect
              x={119}
              y={52}
              width={83}
              height={88}
              rx={18}
              fill={paint.raised}
              stroke={paint.secondary}
            />
            <path
              d="M139 99V79l40-7v20m-40-9 40-7"
              stroke={paint.ink}
              strokeWidth={3}
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx={133} cy={100} r={7} fill={paint.ink} />
            <circle cx={173} cy={94} r={7} fill={paint.ink} />
            <path
              d="M148 114c-8-10-19 4 0 15 19-11 8-25 0-15"
              fill={paint.accent}
            />
            <rect
              x={183}
              y={24}
              width={35}
              height={25}
              rx={8}
              fill={paint.highlight}
            />
            <path d="m188 47-1 9 11-8" fill={paint.highlight} />
            <circle cx={194} cy={36} r={2} fill={paint.ink} />
            <circle cx={207} cy={36} r={2} fill={paint.ink} />
          </>
        )}
        {page === 3 && (
          <>
            <path
              d="m123 23-53 124h106Zm78 0-40 124h101Z"
              fill={paint.secondary}
              opacity={0.2}
            />
            <g transform="rotate(-8 146 90)">
              <rect
                x={76}
                y={39}
                width={149}
                height={106}
                rx={12}
                fill={paint.card}
                stroke={paint.secondary}
              />
              <path d="M77 70h147" stroke={paint.secondary} />
              <path
                d="M104 31v17m92-17v17"
                stroke={paint.accent}
                strokeWidth={6}
                strokeLinecap="round"
              />
              {[96, 123, 150, 177, 204].map((x) => (
                <g key={x}>
                  <rect
                    x={x - 5}
                    y={84}
                    width={10}
                    height={10}
                    rx={3}
                    fill={paint.muted}
                    opacity={0.5}
                  />
                  <rect
                    x={x - 5}
                    y={110}
                    width={10}
                    height={10}
                    rx={3}
                    fill={paint.muted}
                    opacity={0.5}
                  />
                </g>
              ))}
              <rect
                x={138}
                y={103}
                width={25}
                height={25}
                rx={6}
                fill={paint.accent}
              />
              <path
                d="m144 115 4 4 8-9"
                stroke="white"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
              />
            </g>
            <g transform="rotate(12 234 113)">
              <rect
                x={199}
                y={71}
                width={58}
                height={86}
                rx={8}
                fill={paint.accent}
              />
              <line
                x1={203}
                y1={133}
                x2={253}
                y2={133}
                stroke="white"
                strokeOpacity={0.6}
                strokeDasharray="3 4"
              />
              <path
                d="m227 84 4 8 9 1-7 7 2 9-8-5-8 5 2-9-7-7 9-1Z"
                fill="white"
              />
              <path
                d="M216 144h24"
                stroke="white"
                strokeWidth={3}
                strokeLinecap="round"
              />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

export default function LoginTour() {
  const [page, setPage] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const selected = useRef(0);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      element.scrollTo({
        left: selected.current * element.clientWidth,
        behavior: "instant",
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function goTo(index: number) {
    const element = viewport.current;
    if (!element) return;
    const next = Math.max(0, Math.min(slides.length - 1, index));
    element.scrollTo({
      left: next * element.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <section
      className="login-tour"
      aria-label="Discover Rocksky"
      aria-roledescription="carousel"
    >
      <div className="login-tour-brand">Rocksky</div>
      <p className="login-tour-tagline">Your music, your community</p>
      <div
        className="login-tour-viewport"
        ref={viewport}
        tabIndex={0}
        aria-label="Feature tour. Use left and right arrow keys to browse."
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          goTo(page + (event.key === "ArrowRight" ? 1 : -1));
        }}
        onScroll={(event) => {
          const element = event.currentTarget;
          const next = Math.max(
            0,
            Math.min(
              slides.length - 1,
              Math.round(element.scrollLeft / element.clientWidth),
            ),
          );
          selected.current = next;
          setPage(next);
        }}
      >
        {slides.map((slide, index) => (
          <div
            className="login-tour-slide"
            key={slide.label}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            aria-hidden={index !== page}
          >
            <Illustration page={index} />
            <p className="login-tour-eyebrow">{slide.label}</p>
            <h2>{slide.title}</h2>
            <p className="login-tour-description">{slide.description}</p>
          </div>
        ))}
      </div>
      <div className="login-tour-navigation">
        <button
          type="button"
          aria-label="Previous feature"
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
        >
          <ChevronLeft size={20} />
        </button>
        {slides.map((slide, index) => (
          <button
            type="button"
            key={slide.label}
            aria-label={`Feature ${index + 1} of ${slides.length}: ${slide.title}`}
            aria-current={index === page ? "true" : undefined}
            onClick={() => goTo(index)}
          >
            <span className="login-tour-dot" />
          </button>
        ))}
        <button
          type="button"
          aria-label="Next feature"
          disabled={page === slides.length - 1}
          onClick={() => goTo(page + 1)}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <span
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >{`Feature ${page + 1} of ${slides.length}: ${slides[page].title}`}</span>
    </section>
  );
}
