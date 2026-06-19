import { CROSSFADE_INT_TO_MODE, useAudioSettings } from "../../../../hooks/useAudioSettings";
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

function fmtSec(ms: number) {
  return `${(ms / 1000).toFixed(1)} s`;
}

export function Crossfade() {
  const { data, actions } = useAudioSettings();
  const mode = data ? CROSSFADE_INT_TO_MODE[data.crossfade] ?? "disabled" : "disabled";
  // Rockbox stores durations in seconds; lexicon and our UI use ms.
  const inDelay = (data?.crossfadeFadeInDelay ?? 0) * 1000;
  const inDur = (data?.crossfadeFadeInDuration ?? 0) * 1000;
  const outDelay = (data?.crossfadeFadeOutDelay ?? 0) * 1000;
  const outDur = (data?.crossfadeFadeOutDuration ?? 0) * 1000;
  const mix = data?.crossfadeFadeOutMixmode === 1 ? "mix" : "crossfade";
  const disabled = mode === "disabled";

  return (
    <Section>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Crossfade</CardTitle>
            <CardHint>
              Smooth transitions between tracks. Set when crossfading triggers,
              then tune in/out fade timing.
            </CardHint>
          </div>
        </CardHeader>

        <SliderRow>
          <Label>
            When
            <LabelHint>Apply on every track, only when shuffling, etc.</LabelHint>
          </Label>
          <Select
            value={mode}
            onChange={(e) =>
              actions.setCrossfade({
                mode: e.target.value as
                  | "disabled"
                  | "enabled"
                  | "shuffle"
                  | "albumChange"
                  | "trackChange",
              })
            }
          >
            <option value="disabled">Off</option>
            <option value="enabled">Always</option>
            <option value="shuffle">When shuffling</option>
            <option value="albumChange">Between albums</option>
            <option value="trackChange">Between tracks</option>
          </Select>
        </SliderRow>

        <SliderRow>
          <Label>
            Fade-in delay
            <LabelHint>Wait before fading in the next track</LabelHint>
          </Label>
          <Slider
            type="range"
            min={0}
            max={7000}
            step={1000}
            value={inDelay}
            disabled={disabled}
            onChange={(e) =>
              actions.setCrossfade({ fadeInDelay: Number(e.target.value) })
            }
          />
          <Value>{fmtSec(inDelay)}</Value>
        </SliderRow>

        <SliderRow>
          <Label>
            Fade-in duration
            <LabelHint>How long the incoming track fades up</LabelHint>
          </Label>
          <Slider
            type="range"
            min={0}
            max={15000}
            step={1000}
            value={inDur}
            disabled={disabled}
            onChange={(e) =>
              actions.setCrossfade({ fadeInDuration: Number(e.target.value) })
            }
          />
          <Value>{fmtSec(inDur)}</Value>
        </SliderRow>

        <SliderRow>
          <Label>
            Fade-out delay
            <LabelHint>Wait before fading out the current track</LabelHint>
          </Label>
          <Slider
            type="range"
            min={0}
            max={7000}
            step={1000}
            value={outDelay}
            disabled={disabled}
            onChange={(e) =>
              actions.setCrossfade({ fadeOutDelay: Number(e.target.value) })
            }
          />
          <Value>{fmtSec(outDelay)}</Value>
        </SliderRow>

        <SliderRow>
          <Label>
            Fade-out duration
            <LabelHint>How long the outgoing track fades out</LabelHint>
          </Label>
          <Slider
            type="range"
            min={0}
            max={15000}
            step={1000}
            value={outDur}
            disabled={disabled}
            onChange={(e) =>
              actions.setCrossfade({ fadeOutDuration: Number(e.target.value) })
            }
          />
          <Value>{fmtSec(outDur)}</Value>
        </SliderRow>

        <SliderRow>
          <Label>
            Mix mode
            <LabelHint>How fade-in and fade-out overlap</LabelHint>
          </Label>
          <Select
            value={mix}
            disabled={disabled}
            onChange={(e) =>
              actions.setCrossfade({
                fadeOutMixMode: e.target.value as "crossfade" | "mix",
              })
            }
          >
            <option value="crossfade">Crossfade</option>
            <option value="mix">Mix</option>
          </Select>
        </SliderRow>
      </Card>
    </Section>
  );
}

export default Crossfade;
