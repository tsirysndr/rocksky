import { IconX } from "@tabler/icons-react";
import { Slider } from "baseui/slider";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import {
  crossfadeDurationAtom,
  crossfadeEnabledAtom,
  eqBandsAtom,
  eqEnabledAtom,
  EQ_BANDS,
  EQ_BANDS_HZ,
  type EqBandSetting,
} from "../../atoms/equalizer";

function formatFreq(hz: number) {
  return hz >= 1000 ? `${hz / 1000}kHz` : `${hz}`;
}

// Compact, on-brand overrides for the baseweb Slider (crossfade duration).
const SLIDER_OVERRIDES = {
  Root: { style: { flexGrow: 1 } },
  Track: {
    style: {
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: "8px",
      paddingBottom: "8px",
    },
  },
  InnerTrack: {
    style: {
      height: "6px",
      borderTopLeftRadius: "3px",
      borderTopRightRadius: "3px",
      borderBottomLeftRadius: "3px",
      borderBottomRightRadius: "3px",
      background: "var(--color-border)",
    },
  },
  Thumb: {
    style: ({ $disabled }: { $disabled?: boolean }) => ({
      height: "16px",
      width: "16px",
      borderTopLeftRadius: "50%",
      borderTopRightRadius: "50%",
      borderBottomLeftRadius: "50%",
      borderBottomRightRadius: "50%",
      backgroundColor: "var(--color-primary)",
      borderWidth: 0,
      opacity: $disabled ? 0.35 : 1,
    }),
  },
  InnerThumb: { style: { display: "none" } },
  ThumbValue: { style: { display: "none" } },
  Tick: { style: { display: "none" } },
  TickBar: { style: { display: "none" } },
};

// EQ band faders use native range inputs — baseweb's Slider is horizontal-only
// (can't render the vertical portrait faders) and too chunky for a dense
// 10-band grid. baseweb's Slider IS used for the horizontal crossfade below.

/** One vertical EQ band fader (portrait, gain in dB). */
function VertBandSlider(props: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="range"
      aria-label={props["aria-label"]}
      min={-24}
      max={24}
      step={1}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(Number(e.target.value))}
      style={{
        appearance: "none",
        WebkitAppearance: "slider-vertical",
        writingMode: "vertical-lr",
        direction: "rtl",
        width: 20,
        height: 120,
        cursor: props.disabled ? "not-allowed" : "pointer",
        accentColor: "var(--color-primary)",
        opacity: props.disabled ? 0.35 : 1,
      } as React.CSSProperties}
    />
  );
}

/** One horizontal EQ band fader (landscape layout, gain in dB). */
function HorizBandSlider(props: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="range"
      aria-label={props["aria-label"]}
      min={-24}
      max={24}
      step={1}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(Number(e.target.value))}
      className="flex-1"
      style={{
        accentColor: "var(--color-primary)",
        opacity: props.disabled ? 0.35 : 1,
        cursor: props.disabled ? "not-allowed" : "pointer",
        height: 4,
      }}
    />
  );
}

function EqCurve({ bands, enabled }: { bands: EqBandSetting[]; enabled: boolean }) {
  const W = 600;
  const H = 56;
  const GAIN_MAX = 24;

  const xOf = (i: number) => (i / (bands.length - 1)) * W;
  const yOf = (gain: number) => H / 2 - (gain / GAIN_MAX) * (H / 2 - 4);
  const points = bands.map((b, i) => [xOf(i), yOf(b.gain)]);

  const d = useMemo(() => {
    if (points.length < 2) return "";
    let path = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
    }
    return path;
  }, [points]);

  const fillD = `${d} L ${W} ${H} L 0 ${H} Z`;
  const color = enabled ? "var(--color-primary)" : "#555";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: H, display: "block", marginBottom: 2 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="eq-fill-m" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={enabled ? 0.4 : 0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--color-border)" strokeWidth={1} />
      <path d={fillD} fill="url(#eq-fill-m)" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={enabled ? 1 : 0.35} />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill={color} opacity={enabled ? 1 : 0.35} />
      ))}
    </svg>
  );
}

type Props = { open: boolean; onClose: () => void };

export default function EqualizerSheet({ open, onClose }: Props) {
  const [enabled, setEnabled] = useAtom(eqEnabledAtom);
  const [bands, setBands] = useAtom(eqBandsAtom);
  const [crossfadeEnabled, setCrossfadeEnabled] = useAtom(crossfadeEnabledAtom);
  const [crossfadeDuration, setCrossfadeDuration] = useAtom(crossfadeDurationAtom);

  const setBandGain = useCallback((index: number, gain: number) => {
    setBands((prev) => prev.map((b, i) => i === index ? { ...b, gain } : b));
  }, [setBands]);

  const reset = useCallback(() => {
    setBands(EQ_BANDS.map((b) => ({ ...b, gain: 0 })));
  }, [setBands]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl"
        style={{ backgroundColor: "var(--color-surface)", borderTop: "1px solid var(--color-border)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p className="m-0 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Equalizer</p>
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="px-3 py-1 text-xs border-none bg-transparent rounded-lg cursor-pointer"
              style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
            >
              Reset
            </button>
            {/* Enable toggle */}
            <button
              onClick={() => setEnabled((v) => !v)}
              className="flex items-center gap-2 border-none bg-transparent cursor-pointer p-0"
              style={{ color: enabled ? "var(--color-primary)" : "var(--color-text-muted)" }}
            >
              <span
                className="relative inline-flex shrink-0"
                style={{
                  width: 32, height: 18, borderRadius: 9,
                  background: enabled ? "var(--color-primary)" : "var(--color-border)",
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute", top: 2,
                    left: enabled ? 16 : 2,
                    width: 14, height: 14,
                    borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </span>
              <span className="text-xs font-semibold">{enabled ? "On" : "Off"}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 border-none bg-transparent cursor-pointer rounded-lg"
              style={{ color: "var(--color-text-muted)" }}
            >
              <IconX size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3 pb-2">
          <EqCurve bands={bands} enabled={enabled} />
        </div>

        {/* Sliders — portrait: vertical, landscape: horizontal rows */}
        <div className="landscape:hidden flex px-2 pb-4" style={{ gap: 0 }}>
          {/* dB labels column */}
          <div className="flex flex-col justify-between items-end pr-1 shrink-0" style={{ height: 150, paddingTop: 18, paddingBottom: 20 }}>
            <span style={{ fontSize: "0.55rem", color: "var(--color-text-muted)", fontWeight: 600 }}>+24</span>
            <span style={{ fontSize: "0.55rem", color: "var(--color-text-muted)", fontWeight: 600 }}>0</span>
            <span style={{ fontSize: "0.55rem", color: "var(--color-text-muted)", fontWeight: 600 }}>-24</span>
          </div>
          {bands.map((band, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.6rem", fontWeight: 600 }}>
                {band.gain > 0 ? `+${band.gain}` : band.gain}
              </span>
              <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <VertBandSlider
                  aria-label={`${formatFreq(EQ_BANDS_HZ[i] ?? band.cutoff)} gain`}
                  value={band.gain}
                  disabled={!enabled}
                  onChange={(v) => setBandGain(i, v)}
                />
              </div>
              <span style={{ fontSize: "0.58rem", color: "var(--color-text-muted)", fontWeight: 600, textAlign: "center" }}>
                {formatFreq(EQ_BANDS_HZ[i] ?? band.cutoff)}
              </span>
            </div>
          ))}
        </div>

        {/* Landscape layout — horizontal sliders in a grid */}
        <div className="hidden landscape:block px-4 pb-2">
          {/* dB axis labels */}
          <div className="flex items-center mb-1 gap-2" style={{ paddingLeft: 36 }}>
            <span style={{ fontSize: "0.55rem", color: "var(--color-text-muted)", fontWeight: 600, flexShrink: 0 }}>-24dB</span>
            <div className="flex-1" />
            <span style={{ fontSize: "0.55rem", color: "var(--color-text-muted)", fontWeight: 600, flexShrink: 0 }}>0dB</span>
            <div className="flex-1" />
            <span style={{ fontSize: "0.55rem", color: "var(--color-text-muted)", fontWeight: 600, flexShrink: 0, paddingRight: 28 }}>+24dB</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {bands.map((band, i) => (
              <div key={i} className="flex items-center gap-2">
                <span style={{ fontSize: "0.6rem", color: "var(--color-text-muted)", fontWeight: 600, width: 32, textAlign: "right", flexShrink: 0 }}>
                  {formatFreq(EQ_BANDS_HZ[i] ?? band.cutoff)}
                </span>
                <HorizBandSlider
                  aria-label={`${formatFreq(EQ_BANDS_HZ[i] ?? band.cutoff)} gain`}
                  value={band.gain}
                  disabled={!enabled}
                  onChange={(v) => setBandGain(i, v)}
                />
                <span style={{ fontSize: "0.6rem", color: "var(--color-text-muted)", fontWeight: 600, width: 28, textAlign: "right", flexShrink: 0 }}>
                  {band.gain > 0 ? `+${band.gain}` : band.gain}dB
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Crossfade — smooth transitions between tracks (rockbox pcmbuf) */}
        <div
          className="px-5 py-3 flex items-center gap-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <button
            onClick={() => setCrossfadeEnabled((v) => !v)}
            className="flex items-center gap-2 border-none bg-transparent cursor-pointer p-0"
            style={{ color: crossfadeEnabled ? "var(--color-primary)" : "var(--color-text-muted)" }}
          >
            <span
              className="relative inline-flex shrink-0"
              style={{
                width: 32, height: 18, borderRadius: 9,
                background: crossfadeEnabled ? "var(--color-primary)" : "var(--color-border)",
                transition: "background 0.2s",
              }}
            >
              <span
                style={{
                  position: "absolute", top: 2,
                  left: crossfadeEnabled ? 16 : 2,
                  width: 14, height: 14,
                  borderRadius: "50%", background: "#fff",
                  transition: "left 0.2s",
                }}
              />
            </span>
            <span className="text-xs font-semibold">Crossfade</span>
          </button>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1">
              <Slider
                min={1}
                max={12}
                step={1}
                value={[crossfadeDuration]}
                disabled={!crossfadeEnabled}
                onChange={({ value }) => {
                  if (value?.length) setCrossfadeDuration(value[0]);
                }}
                overrides={SLIDER_OVERRIDES}
              />
            </div>
            <span style={{ fontSize: "0.6rem", color: "var(--color-text-muted)", fontWeight: 600, width: 28, textAlign: "right", flexShrink: 0 }}>
              {crossfadeDuration}s
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
