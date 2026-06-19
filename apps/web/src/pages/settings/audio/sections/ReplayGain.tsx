import { REPLAYGAIN_INT_TO_MODE, useAudioSettings } from "../../../../hooks/useAudioSettings";
import {
  Card,
  CardHeader,
  CardHint,
  CardTitle,
  Label,
  LabelHint,
  Row,
  Section,
  Select,
  Slider,
  SliderRow,
  Toggle,
  Value,
} from "../styles";

function fmtPreamp(tenths: number) {
  const db = tenths / 10;
  const sign = db > 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}

export function ReplayGain() {
  const { data, actions } = useAudioSettings();
  const mode = data
    ? REPLAYGAIN_INT_TO_MODE[data.replaygainSettings.type] ?? "disabled"
    : "disabled";
  const preamp = data?.replaygainSettings.preamp ?? 0;
  const noclip = data?.replaygainSettings.noclip ?? false;
  const disabled = mode === "disabled";

  return (
    <Section>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Replay Gain</CardTitle>
            <CardHint>
              Normalize loudness across tracks using metadata tags. Tracks
              without Replay Gain tags play at their original level.
            </CardHint>
          </div>
        </CardHeader>

        <SliderRow>
          <Label>
            Mode
            <LabelHint>Which Replay Gain tag to honor</LabelHint>
          </Label>
          <Select
            value={mode}
            onChange={(e) =>
              actions.setReplayGain({
                mode: e.target.value as
                  | "disabled"
                  | "track"
                  | "album"
                  | "trackIfShuffling",
              })
            }
          >
            <option value="disabled">Off</option>
            <option value="track">Track</option>
            <option value="album">Album</option>
            <option value="trackIfShuffling">Track when shuffling, else album</option>
          </Select>
        </SliderRow>

        <SliderRow>
          <Label>
            Pre-amplification
            <LabelHint>Boost applied after gain normalization, ±12 dB</LabelHint>
          </Label>
          <Slider
            type="range"
            min={-120}
            max={120}
            step={5}
            value={preamp}
            disabled={disabled}
            onChange={(e) =>
              actions.setReplayGain({ preamp: Number(e.target.value) })
            }
          />
          <Value>{fmtPreamp(preamp)}</Value>
        </SliderRow>

        <Row>
          <Label>
            Prevent clipping
            <LabelHint>
              Reduce volume when boosted output would clip the DAC
            </LabelHint>
          </Label>
          <Toggle
            on={noclip}
            onClick={() => actions.setReplayGain({ preventClipping: !noclip })}
            aria-label="Toggle prevent clipping"
          />
        </Row>
      </Card>
    </Section>
  );
}

export default ReplayGain;
