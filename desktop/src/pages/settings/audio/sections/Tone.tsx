import { CHANNELS_INT_TO_NAME, useAudioSettings } from "../../../../hooks/useAudioSettings";
import {
  Card,
  CardHeader,
  CardHint,
  CardTitle,
  Label,
  LabelHint,
  Section,
  Select,
  Slider,
  SliderRow,
  Value,
} from "../styles";

function fmtDb(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v} dB`;
}

function fmtBalance(v: number) {
  if (v === 0) return "Center";
  return v < 0 ? `L ${Math.abs(v)}%` : `R ${v}%`;
}

export function Tone() {
  const { data, actions } = useAudioSettings();
  const bass = data?.bass ?? 0;
  const treble = data?.treble ?? 0;
  const balance = data?.balance ?? 0;
  const channels = data ? CHANNELS_INT_TO_NAME[data.channelConfig] ?? "stereo" : "stereo";

  return (
    <Section>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tone</CardTitle>
            <CardHint>
              Coarse shelf adjustments. Use the equalizer for finer control.
            </CardHint>
          </div>
        </CardHeader>

        <SliderRow>
          <Label>
            Bass
            <LabelHint>Low-frequency shelf, ±24 dB</LabelHint>
          </Label>
          <Slider
            type="range"
            min={-24}
            max={24}
            step={1}
            value={bass}
            onChange={(e) => actions.setTone({ bass: Number(e.target.value) })}
          />
          <Value>{fmtDb(bass)}</Value>
        </SliderRow>

        <SliderRow>
          <Label>
            Treble
            <LabelHint>High-frequency shelf, ±24 dB</LabelHint>
          </Label>
          <Slider
            type="range"
            min={-24}
            max={24}
            step={1}
            value={treble}
            onChange={(e) => actions.setTone({ treble: Number(e.target.value) })}
          />
          <Value>{fmtDb(treble)}</Value>
        </SliderRow>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Stereo</CardTitle>
            <CardHint>Channel routing and L/R balance.</CardHint>
          </div>
        </CardHeader>

        <SliderRow>
          <Label>
            Balance
            <LabelHint>Pan between left and right channels</LabelHint>
          </Label>
          <Slider
            type="range"
            min={-100}
            max={100}
            step={5}
            value={balance}
            onChange={(e) => actions.setTone({ balance: Number(e.target.value) })}
          />
          <Value>{fmtBalance(balance)}</Value>
        </SliderRow>

        <SliderRow>
          <Label>
            Channels
            <LabelHint>Stereo, mono, karaoke, or single-channel routing</LabelHint>
          </Label>
          <Select
            value={channels}
            onChange={(e) =>
              actions.setTone({
                channels: e.target.value as
                  | "stereo"
                  | "mono"
                  | "monoLeft"
                  | "monoRight"
                  | "karaoke"
                  | "wide",
              })
            }
          >
            <option value="stereo">Stereo</option>
            <option value="mono">Mono</option>
            <option value="monoLeft">Mono (Left only)</option>
            <option value="monoRight">Mono (Right only)</option>
            <option value="wide">Wide</option>
            <option value="karaoke">Karaoke</option>
          </Select>
        </SliderRow>
      </Card>
    </Section>
  );
}

export default Tone;
