import styled from "@emotion/styled";
import { IconX } from "@tabler/icons-react";
import { useCallback, useMemo } from "react";
import { EQ_BANDS, EQ_Q, type EqBandSetting } from "../../atoms/equalizer";
import { useAudioSettings } from "../../hooks/useAudioSettings";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
`;

const Modal = styled.div`
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 20px 20px 0 0;
  padding: 24px 28px 32px;
  width: 100%;
  max-width: 860px;
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.25);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`;

const Title = styled.h2`
  font-size: 1rem;
  font-family: RockfordSansMedium;
  color: var(--color-text);
  margin: 0;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const Toggle = styled.button<{ on: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: ${({ on }) => on ? "var(--color-primary)" : "var(--color-text-muted)"};
  font-size: 0.8rem;
  font-family: RockfordSansMedium;
  padding: 0;
`;

const ToggleTrack = styled.span<{ on: boolean }>`
  display: inline-flex;
  width: 32px;
  height: 18px;
  border-radius: 9px;
  background: ${({ on }) => on ? "var(--color-primary)" : "var(--color-border)"};
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ on }) => on ? "16px" : "2px"};
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: left 0.2s;
  }
`;

const CloseBtn = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 6px;
  &:hover { background: var(--color-menu-hover); }
`;

const ResetBtn = styled.button`
  border: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-family: RockfordSansMedium;
  padding: 4px 10px;
  border-radius: 6px;
  &:hover { background: var(--color-menu-hover); color: var(--color-text); }
`;

// SVG gradient curve drawn over sliders
function EqCurve({ bands, enabled }: { bands: EqBandSetting[]; enabled: boolean }) {
  const W = 800;
  const H = 64;
  const GAIN_MAX = 24;

  // Map band index to X position (equally spaced)
  const xOf = (i: number) => (i / (bands.length - 1)) * W;
  // Map gain to Y (0dB = centre)
  const yOf = (gain: number) => H / 2 - (gain / GAIN_MAX) * (H / 2 - 4);

  const points = bands.map((b, i) => [xOf(i), yOf(b.gain)]);

  // Catmull-Rom → cubic bezier approximation for smooth curve
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
  const color = enabled ? "var(--color-primary)" : "#888";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: H, display: "block", marginBottom: 4 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={enabled ? 0.35 : 0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Zero line */}
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--color-border)" strokeWidth={1} />
      {/* Fill area */}
      <path d={fillD} fill="url(#eq-fill)" />
      {/* Curve line */}
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={enabled ? 1 : 0.4} />
      {/* Dots at band positions */}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill={color} opacity={enabled ? 1 : 0.4} />
      ))}
    </svg>
  );
}

const SlidersRow = styled.div`
  display: flex;
  gap: 0;
  align-items: flex-end;
  margin-bottom: 8px;
`;

const BandCol = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
`;

const GainLabel = styled.span`
  font-size: 0.65rem;
  font-family: RockfordSansMedium;
  color: var(--color-text-muted);
  min-width: 28px;
  text-align: center;
`;

const SliderWrap = styled.div`
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const VerticalSlider = styled.input<{ disabled: boolean }>`
  appearance: slider-vertical;
  -webkit-appearance: slider-vertical;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 22px;
  height: 148px;
  cursor: ${({ disabled }) => disabled ? "not-allowed" : "pointer"};
  accent-color: var(--color-primary);
  opacity: ${({ disabled }) => disabled ? 0.35 : 1};
`;

const FreqLabel = styled.span`
  font-size: 0.62rem;
  font-family: RockfordSansMedium;
  color: var(--color-text-muted);
  text-align: center;
  white-space: nowrap;
`;

function formatFreq(hz: number) {
  return hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`;
}

type Props = { onClose: () => void };

function EqualizerModal({ onClose }: Props) {
  const { data, actions } = useAudioSettings();

  // Rockbox stores gain in TENTHS of dB; render in whole dB for the slider.
  // Q is also ×10 in rockbox (70 → Q 0.7).
  const enabled = data?.eqEnabled ?? false;
  // Rockbox stores gain in tenths of dB; keep half-dB precision in the UI
  // (a value like -135 in the wire format means -13.5 dB).
  const bands: EqBandSetting[] = useMemo(
    () =>
      (data?.eqBandSettings ?? EQ_BANDS).map((b) => ({
        cutoff: b.cutoff,
        gain: b.gain / 10,
      })),
    [data?.eqBandSettings],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      actions.setEqualizer({ enabled: next });
    },
    [actions],
  );

  const setBandGain = useCallback(
    (index: number, gainDb: number) => {
      const next = bands.map((b, i) =>
        i === index ? { ...b, gain: gainDb } : b,
      );
      // Convert display dB → wire tenths and add the q factor rockbox expects.
      // Round to integer tenths to avoid float drift (e.g. 0.30000000004).
      actions.setEqualizer({
        bands: next.map((b) => ({
          cutoff: b.cutoff,
          gain: Math.round(b.gain * 10),
          q: Math.round(EQ_Q * 10),
        })),
      });
    },
    [actions, bands],
  );

  const reset = useCallback(() => {
    actions.setEqualizer({
      bands: EQ_BANDS.map((b) => ({
        cutoff: b.cutoff,
        gain: 0,
        q: Math.round(EQ_Q * 10),
      })),
    });
  }, [actions]);

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>Equalizer</Title>
          <HeaderRight>
            <ResetBtn onClick={reset}>Reset</ResetBtn>
            <Toggle on={enabled} onClick={() => setEnabled(!enabled)}>
              <ToggleTrack on={enabled} />
              {enabled ? "On" : "Off"}
            </Toggle>
            <CloseBtn onClick={onClose}><IconX size={18} /></CloseBtn>
          </HeaderRight>
        </Header>

        <EqCurve bands={bands} enabled={enabled} />

        <div style={{ display: "flex", alignItems: "stretch" }}>
          {/* dB axis labels */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-end", paddingRight: 6, paddingTop: 22, paddingBottom: 24, flexShrink: 0 }}>
            <GainLabel>+24dB</GainLabel>
            <GainLabel>0dB</GainLabel>
            <GainLabel>-24dB</GainLabel>
          </div>
          <SlidersRow style={{ flex: 1 }}>
            {bands.map((band, i) => {
              const display = band.gain === Math.trunc(band.gain)
                ? band.gain.toFixed(0)
                : band.gain.toFixed(1);
              return (
                <BandCol key={i}>
                  <GainLabel>{band.gain > 0 ? `+${display}` : display}</GainLabel>
                  <SliderWrap>
                    <VerticalSlider
                      type="range"
                      min={-24}
                      max={24}
                      step={0.5}
                      value={band.gain}
                      disabled={!enabled}
                      onChange={(e) => setBandGain(i, Number(e.target.value))}
                    />
                  </SliderWrap>
                  <FreqLabel>{formatFreq(band.cutoff)}</FreqLabel>
                </BandCol>
              );
            })}
          </SlidersRow>
        </div>
      </Modal>
    </Overlay>
  );
}

export default EqualizerModal;
