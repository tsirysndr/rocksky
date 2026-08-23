import { useState } from "react";
import Main from "../../../layouts/Main";
import { useAudioSettings } from "../../../hooks/useAudioSettings";
import { Crossfade } from "./sections/Crossfade";
import { Equalizer } from "./sections/Equalizer";
import { ReplayGain } from "./sections/ReplayGain";
import { Tone } from "./sections/Tone";
import {
  Header,
  LoadingState,
  PageWrap,
  Subtitle,
  Tab,
  TabStrip,
  Title,
} from "./styles";

type SectionId = "equalizer" | "tone" | "crossfade" | "replaygain";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "equalizer", label: "Equalizer" },
  { id: "tone", label: "Tone" },
  { id: "crossfade", label: "Crossfade" },
  { id: "replaygain", label: "Replay Gain" },
];

export function SettingsAudio() {
  const [active, setActive] = useState<SectionId>("equalizer");
  const { isLoading, isError } = useAudioSettings();

  return (
    <Main>
      <PageWrap>
        <Header>
          <Title>Audio Settings</Title>
          <Subtitle>
            Tweak EQ, tone, crossfade and replay gain. Settings sync across
            devices and apply to playback in real time.
          </Subtitle>
        </Header>

        <TabStrip role="tablist">
          {SECTIONS.map((s) => (
            <Tab
              key={s.id}
              role="tab"
              aria-selected={active === s.id}
              active={active === s.id}
              onClick={() => setActive(s.id)}
            >
              {s.label}
            </Tab>
          ))}
        </TabStrip>

        {isLoading ? (
          <LoadingState>Loading audio settings…</LoadingState>
        ) : isError ? (
          <LoadingState>
            Couldn't reach your rockbox instance. Try again in a moment.
          </LoadingState>
        ) : active === "equalizer" ? (
          <Equalizer />
        ) : active === "tone" ? (
          <Tone />
        ) : active === "crossfade" ? (
          <Crossfade />
        ) : (
          <ReplayGain />
        )}
      </PageWrap>
    </Main>
  );
}

export default SettingsAudio;
