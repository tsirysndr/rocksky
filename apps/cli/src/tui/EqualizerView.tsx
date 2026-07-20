import { Box, Text, useInput } from "ink";
import { useAtom } from "jotai";
import React, { useState } from "react";
import {
  CROSSFADE_MODES,
  EQ_BANDS_HZ,
  EQ_MAX_DB,
  MIX_MODES,
  REPLAYGAIN_MODES,
  TONE_MAX_DB,
  playerController,
} from "./player";
import { soundOpenAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

const SLIDER_ROWS = 9; // odd, so there is a centre (0 dB) row

interface Column {
  label: string;
  value: number;
  max: number; // symmetric range: [-max, max]
  step: number;
}

function hzLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

// One vertical slider: a column of cells filled from the 0-dB centre toward the
// current value.
function Slider({ col, active }: { col: Column; active: boolean }) {
  const color = active ? TEAL : VIOLET;
  const mid = (SLIDER_ROWS - 1) / 2;
  const rows: React.ReactNode[] = [];
  for (let r = 0; r < SLIDER_ROWS; r++) {
    // dB value at this row (top row = +max, bottom = -max)
    const db = ((mid - r) / mid) * col.max;
    const filled =
      (col.value >= 0 && db <= col.value && db >= 0) ||
      (col.value < 0 && db >= col.value && db <= 0);
    const isCentre = r === mid;
    rows.push(
      <Text key={r} color={filled ? color : undefined} dimColor={!filled}>
        {filled ? "██" : isCentre ? "──" : "  "}
      </Text>,
    );
  }
  return (
    <Box flexDirection="column" alignItems="center" marginRight={1}>
      {rows}
      <Text color={active ? BLUE : VIOLET} bold={active}>
        {col.label.padStart(2, " ").slice(0, 4)}
      </Text>
      <Text dimColor>{col.value > 0 ? `+${col.value}` : String(col.value)}</Text>
    </Box>
  );
}

export function EqualizerView() {
  const [, setOpen] = useAtom(soundOpenAtom);
  const sound = playerController.sound;
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [sel, setSel] = useState(0);

  // Columns: 10 EQ bands + Bass + Treble.
  const columns: Column[] = [
    ...EQ_BANDS_HZ.map((hz, i) => ({
      label: hzLabel(hz),
      value: sound.bands[i],
      max: EQ_MAX_DB,
      step: 1,
    })),
    { label: "Bass", value: sound.bass, max: TONE_MAX_DB, step: 2 },
    { label: "Treb", value: sound.treble, max: TONE_MAX_DB, step: 2 },
  ];
  const bandCount = EQ_BANDS_HZ.length;

  function adjust(delta: number) {
    // Read the live value from the controller (not the render-time closure) so
    // rapid successive key presses accumulate correctly.
    const s = playerController.sound;
    const cur = sel < bandCount ? s.bands[sel] : sel === bandCount ? s.bass : s.treble;
    const max = sel < bandCount ? EQ_MAX_DB : TONE_MAX_DB;
    const step = sel < bandCount ? 1 : 2;
    const next = Math.max(-max, Math.min(max, cur + delta * step));
    if (sel < bandCount) playerController.setEqBandGain(sel, next);
    else if (sel === bandCount) playerController.setBass(next);
    else playerController.setTreble(next);
    rerender();
  }

  useInput((input, key) => {
    if (key.escape || input === "e") return setOpen(false);
    if (key.leftArrow || input === "h")
      return setSel((s) => Math.max(0, s - 1));
    if (key.rightArrow || input === "l")
      return setSel((s) => Math.min(columns.length - 1, s + 1));
    if (key.upArrow || input === "k") return adjust(1);
    if (key.downArrow || input === "j") return adjust(-1);
    if (input === " ") {
      playerController.setEqEnabled(!sound.eqEnabled);
      rerender();
      return;
    }
    if (input === "x") {
      playerController.setCrossfade((sound.crossfade + 1) % CROSSFADE_MODES.length);
      rerender();
      return;
    }
    if (input === "m") {
      playerController.setMixMode((sound.mixMode + 1) % MIX_MODES.length);
      rerender();
      return;
    }
    if (input === "]") {
      playerController.setCrossfadeSeconds(sound.crossfadeSeconds + 0.5);
      rerender();
      return;
    }
    if (input === "[") {
      playerController.setCrossfadeSeconds(sound.crossfadeSeconds - 0.5);
      rerender();
      return;
    }
    if (input === "g") {
      playerController.setReplaygain(
        (sound.replaygain + 1) % REPLAYGAIN_MODES.length,
      );
      rerender();
      return;
    }
    if (input === "G") {
      playerController.toggleReplaygainClip();
      rerender();
      return;
    }
    if (input === "r") {
      // reset selected column to 0 dB
      if (sel < bandCount) playerController.setEqBandGain(sel, 0);
      else if (sel === bandCount) playerController.setBass(0);
      else playerController.setTreble(0);
      rerender();
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text bold color={BLUE}>
          {" Equalizer "}
        </Text>
        <Text color={sound.eqEnabled ? TEAL : VIOLET}>
          {sound.eqEnabled ? "  ● ON" : "  ○ OFF"}
        </Text>
        <Text dimColor>{`   Crossfade: `}</Text>
        <Text color={TEAL}>{CROSSFADE_MODES[sound.crossfade]}</Text>
        {sound.crossfade !== 0 ? (
          <Text color={TEAL}>{`  ${sound.crossfadeSeconds}s  ${MIX_MODES[sound.mixMode]}`}</Text>
        ) : null}
        <Text dimColor>{`   ReplayGain: `}</Text>
        <Text color={TEAL}>{REPLAYGAIN_MODES[sound.replaygain]}</Text>
        {sound.replaygain !== 0 ? (
          <Text color={TEAL}>
            {`${sound.replaygainClip ? " (no-clip)" : ""}`}
          </Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="row">
        {columns.map((col, i) => (
          <Slider key={col.label} col={col} active={i === sel} />
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor wrap="truncate-end">
          {"←/→ band · ↑/↓ gain · Space EQ · x crossfade · [ ] secs · m mix · g replaygain · G no-clip · r reset · Esc"}
        </Text>
      </Box>
    </Box>
  );
}
