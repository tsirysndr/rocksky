import styled from "@emotion/styled";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo, useState } from "react";
import {
  deleteEqualizerPreset,
  type EqualizerPresetView,
  listEqualizerPresets,
  saveEqualizerPreset,
} from "../../../../api/equalizer-presets";
import { EQ_BANDS, EQ_BANDS_HZ, EQ_Q } from "../../../../atoms/equalizer";
import { profileAtom } from "../../../../atoms/profile";
import { useAudioSettings } from "../../../../hooks/useAudioSettings";
import {
  Card,
  CardHeader,
  CardHint,
  CardTitle,
  Label,
  Row,
  Section,
  Toggle,
} from "../styles";

const SlidersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 8px;
  margin-top: 20px;
  align-items: end;
`;

const BandCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const GainText = styled.span`
  font-family: RockfordSansMedium;
  font-size: 0.7rem;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
`;

// Vertical EQ band fader — native range input styled to match the app's other
// audio sliders. baseweb's Slider is horizontal-only, so it can't render a
// vertical 10-band fader.
const VertSlider = styled.input<{ disabled: boolean }>`
  appearance: none;
  -webkit-appearance: none;
  writing-mode: vertical-lr;
  direction: rtl;
  width: 22px;
  height: 160px;
  background: transparent;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.35 : 1)};

  &::-webkit-slider-runnable-track {
    width: 3px;
    border-radius: 1.5px;
    background: rgba(150, 150, 172, 0.35);
    background: color-mix(in srgb, var(--color-text) 25%, transparent);
  }

  &::-webkit-slider-thumb {
    background: #ffffff;
    margin-top: 0;
    margin-left: -5px;
    box-shadow: 0 0 6px var(--range-glow), 0 0 14px var(--range-glow);
  }
`;

const FreqText = styled.span`
  font-family: RockfordSansRegular;
  font-size: 0.65rem;
  color: var(--color-text-muted);
  white-space: nowrap;
`;

const CurveBox = styled.div`
  margin-top: 8px;
  padding: 16px 0 8px;
  border-top: 1px solid var(--color-border-subtle, var(--color-border));
`;

function formatFreq(hz: number) {
  return hz >= 1000 ? `${hz / 1000}kHz` : `${hz}`;
}

// Rockbox stores gain in tenths of dB (e.g. -135 = -13.5 dB), so keep one
// decimal place. Drop the trailing ".0" for visual cleanliness.
function formatGain(db: number) {
  const sign = db > 0 ? "+" : "";
  const s = db === Math.trunc(db) ? db.toFixed(0) : db.toFixed(1);
  return `${sign}${s}`;
}

// 10 named presets matching common defaults. Gains in tenths of dB.
const PRESETS: { name: string; gains: number[] }[] = [
  { name: "Flat",         gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Rock",         gains: [50, 30, -10, -20, -10, 20, 40, 50, 50, 50] },
  { name: "Pop",          gains: [-10, 20, 40, 50, 30, 0, -10, -10, 0, 10] },
  { name: "Jazz",         gains: [30, 20, 10, 20, -10, -10, 0, 10, 20, 30] },
  { name: "Classical",    gains: [40, 30, 20, 10, -10, -10, 0, 10, 20, 30] },
  { name: "Bass Boost",   gains: [80, 60, 40, 10, -10, -20, -20, -20, 0, 0] },
  { name: "Treble Boost", gains: [0, 0, 0, -10, -20, 10, 30, 50, 60, 70] },
  { name: "Vocal",        gains: [-30, -20, -10, 20, 40, 40, 30, 10, 0, -10] },
  { name: "Electronic",   gains: [40, 30, 0, -20, -20, 0, 10, 20, 40, 50] },
];

function detectPreset(
  rockboxBands: { cutoff: number; gain: number }[],
  saved: EqualizerPresetView[],
): string {
  const gains = rockboxBands.map((b) => b.gain);
  const savedMatch = saved.find(
    (p) =>
      p.bands.length === gains.length &&
      p.bands.every((b, i) => b.gain === gains[i]),
  );
  if (savedMatch) return savedMatch.name;
  for (const p of PRESETS) {
    if (p.gains.every((g, i) => g === gains[i])) return p.name;
  }
  return "Custom";
}

// SVG curve renderer (gradient fill + smooth Catmull-Rom).
function EqCurve({
  bands,
  enabled,
}: {
  bands: { cutoff: number; gain: number }[];
  enabled: boolean;
}) {
  const W = 800;
  const H = 72;
  const GAIN_MAX = 24; // dB
  const xOf = (i: number) => (i / (bands.length - 1)) * W;
  const yOf = (g: number) => H / 2 - (g / GAIN_MAX) * (H / 2 - 6);
  const points = bands.map((b, i) => [xOf(i), yOf(b.gain / 10)]);

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
      style={{ width: "100%", height: H, display: "block" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="eq-fill-page" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={enabled ? 0.32 : 0.1} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line
        x1={0}
        y1={H / 2}
        x2={W}
        y2={H / 2}
        stroke="var(--color-border)"
        strokeWidth={1}
      />
      <path d={fillD} fill="url(#eq-fill-page)" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={enabled ? 1 : 0.4}
      />
      {points.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={3.5}
          fill={color}
          opacity={enabled ? 1 : 0.4}
        />
      ))}
    </svg>
  );
}

export function Equalizer() {
  const { data, actions } = useAudioSettings();
  const profile = useAtomValue(profileAtom);
  const queryClient = useQueryClient();
  const enabled = data?.eqEnabled ?? false;
  // Frequency is fixed by band index — ignore any stale persisted cutoff so the
  // labels are always the canonical 32 Hz … 16 kHz set.
  const bands = (
    data?.eqBandSettings ?? EQ_BANDS.map((b) => ({ ...b, q: EQ_Q * 10 }))
  ).map((b, i) => ({ ...b, cutoff: EQ_BANDS_HZ[i] ?? b.cutoff }));

  const presetsQ = useQuery({
    queryKey: ["equalizer-presets"],
    queryFn: listEqualizerPresets,
    enabled: !!profile?.did,
    staleTime: 60_000,
  });
  const savedPresets = presetsQ.data ?? [];
  const currentPreset = detectPreset(bands, savedPresets);

  const [presetFilter, setPresetFilter] = useState("");
  const [presetName, setPresetName] = useState("");

  const filterQ = presetFilter.trim().toLowerCase();
  const visibleSaved = savedPresets.filter((p) =>
    p.name.toLowerCase().includes(filterQ),
  );
  const visibleBuiltin = PRESETS.filter((p) =>
    p.name.toLowerCase().includes(filterQ),
  );

  const savePreset = useMutation({
    mutationFn: () =>
      saveEqualizerPreset({
        name: presetName.trim(),
        precut: data?.eqPrecut,
        bands: bands.map((b) => ({
          frequency: b.cutoff,
          gain: b.gain,
          q: b.q,
        })),
      }),
    onSuccess: () => {
      setPresetName("");
      queryClient.invalidateQueries({ queryKey: ["equalizer-presets"] });
    },
  });

  const removePreset = useMutation({
    mutationFn: (rkey: string) => deleteEqualizerPreset(rkey),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["equalizer-presets"] }),
  });

  const applySavedPreset = (preset: EqualizerPresetView) => {
    actions.setEqualizer({
      bands: preset.bands.map((b) => ({
        cutoff: b.frequency,
        gain: b.gain,
        q: b.q,
      })),
      ...(preset.precut !== undefined && { precut: preset.precut }),
    });
  };

  const setBand = (index: number, gainDb: number) => {
    // Round to nearest tenth so float drift doesn't accumulate (e.g. 0.30000000004).
    const gainTenths = Math.round(gainDb * 10);
    const next = bands.map((b, i) =>
      i === index ? { ...b, gain: gainTenths } : b,
    );
    actions.setEqualizer({
      bands: next.map((b) => ({
        cutoff: b.cutoff,
        gain: b.gain,
        q: b.q,
      })),
    });
  };

  const applyPreset = (name: string) => {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    actions.setEqualizer({
      bands: bands.map((b, i) => ({
        cutoff: b.cutoff,
        gain: preset.gains[i] ?? 0,
        q: b.q,
      })),
    });
  };

  return (
    <Section>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Equalizer</CardTitle>
            <CardHint>
              10-band graphic EQ applied to all playback. Drag a band to boost
              or cut, or pick a preset.
            </CardHint>
          </div>
          <Toggle
            on={enabled}
            onClick={() => actions.setEqualizer({ enabled: !enabled })}
            aria-label="Toggle equalizer"
          />
        </CardHeader>

        <Row>
          <Label>
            Preset
            <LabelHintInline>{currentPreset}</LabelHintInline>
          </Label>
          <PresetPicker>
            <FilterInput
              type="search"
              placeholder="Filter presets…"
              aria-label="Filter presets"
              value={presetFilter}
              onChange={(e) => setPresetFilter(e.target.value)}
            />
            <PresetButtons>
              {visibleSaved.map((p) => (
                <PresetChip
                  key={p.uri}
                  active={p.name === currentPreset}
                  onClick={() => applySavedPreset(p)}
                  title={`Saved preset — ${p.rkey}`}
                >
                  {p.name}
                  <DeleteX
                    role="button"
                    aria-label={`Delete preset ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removePreset.mutate(p.rkey);
                    }}
                  >
                    ×
                  </DeleteX>
                </PresetChip>
              ))}
              {visibleBuiltin.map((p) => (
                <PresetChip
                  key={p.name}
                  active={p.name === currentPreset}
                  onClick={() => applyPreset(p.name)}
                >
                  {p.name}
                </PresetChip>
              ))}
              {visibleSaved.length === 0 && visibleBuiltin.length === 0 && (
                <LabelHintInline>No presets match "{presetFilter}"</LabelHintInline>
              )}
            </PresetButtons>
          </PresetPicker>
        </Row>

        {!!profile?.did && (
          <Row>
            <Label>
              Save as preset
              <LabelHintInline>
                Saved to your account, synced across devices
              </LabelHintInline>
            </Label>
            <SaveControls>
              <NameInput
                type="text"
                placeholder="Preset name"
                aria-label="Preset name"
                maxLength={64}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && presetName.trim()) savePreset.mutate();
                }}
              />
              <SaveButton
                disabled={!presetName.trim() || savePreset.isPending}
                onClick={() => savePreset.mutate()}
              >
                {savePreset.isPending ? "Saving…" : "Save"}
              </SaveButton>
            </SaveControls>
          </Row>
        )}

        <CurveBox>
          <EqCurve bands={bands} enabled={enabled} />
        </CurveBox>

        <SlidersGrid>
          {bands.map((band, i) => {
            // Keep half-dB precision — rockbox stores tenths, so 1 step = 0.5 dB.
            const gainDb = band.gain / 10;
            return (
              <BandCol key={i}>
                <GainText>{formatGain(gainDb)}</GainText>
                <VertSlider
                  type="range"
                  aria-label={`${formatFreq(band.cutoff)} gain`}
                  min={-24}
                  max={24}
                  step={0.5}
                  value={gainDb}
                  disabled={!enabled}
                  onChange={(e) => setBand(i, Number(e.target.value))}
                />
                <FreqText>{formatFreq(band.cutoff)}</FreqText>
              </BandCol>
            );
          })}
        </SlidersGrid>
      </Card>
    </Section>
  );
}

const PresetPicker = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: 70%;
`;

const PresetButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
`;

const TextInput = styled.input`
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 6px 10px;
  font-family: RockfordSansMedium;
  font-size: 0.75rem;
  &::placeholder {
    color: var(--color-text-muted);
  }
  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`;

const FilterInput = styled(TextInput)`
  width: 180px;
`;

const NameInput = styled(TextInput)`
  width: 180px;
`;

const SaveControls = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
`;

const SaveButton = styled.button`
  background: var(--color-primary);
  color: #fff;
  border: 1px solid var(--color-primary);
  border-radius: 6px;
  padding: 6px 14px;
  font-family: RockfordSansMedium;
  font-size: 0.75rem;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DeleteX = styled.span`
  margin-left: 6px;
  font-size: 0.8rem;
  line-height: 1;
  opacity: 0.6;
  &:hover {
    opacity: 1;
  }
`;

const PresetChip = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active ? "var(--color-primary)" : "transparent"};
  color: ${({ active }) => (active ? "#fff" : "var(--color-text-muted)")};
  border: 1px solid
    ${({ active }) => (active ? "var(--color-primary)" : "var(--color-border)")};
  border-radius: 999px;
  padding: 4px 12px;
  font-family: RockfordSansMedium;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover {
    color: ${({ active }) => (active ? "#fff" : "var(--color-text)")};
    border-color: var(--color-primary);
  }
`;

const LabelHintInline = styled.span`
  font-family: RockfordSansRegular;
  font-size: 0.7rem;
  color: var(--color-text-muted);
`;

export default Equalizer;
