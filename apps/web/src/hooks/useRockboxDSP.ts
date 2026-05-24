import { useAtomValue } from "jotai";
import { useEffect, useRef, type RefObject } from "react";
import { eqBandsAtom, eqEnabledAtom, EQ_Q } from "../atoms/equalizer";

interface AudioGraph {
  ctx: AudioContext;
  filters: BiquadFilterNode[];
}

export function useRockboxDSP(audioRef: RefObject<HTMLAudioElement | null>) {
  const eqEnabled = useAtomValue(eqEnabledAtom);
  const eqBands = useAtomValue(eqBandsAtom);
  const graphRef = useRef<AudioGraph | null>(null);

  // Always-fresh refs so the play-event closure sees the latest EQ state.
  const eqEnabledRef = useRef(eqEnabled);
  const eqBandsRef = useRef(eqBands);
  eqEnabledRef.current = eqEnabled;
  eqBandsRef.current = eqBands;

  // Build the Web Audio graph on the first play event.
  //
  // Why on "play" and not on EQ-enable:
  //   - iOS Safari requires AudioContext creation to happen synchronously
  //     inside a user-gesture call stack. useEffect runs after paint, outside
  //     that stack. The play-button tap fires "play" synchronously, giving us
  //     the gesture context we need.
  //
  // Why crossOrigin="anonymous" is required on the <audio> element:
  //   - Without it the Web Audio spec silently mutes the graph output for
  //     cross-origin media while still playing audio through the default sink.
  //     The filter chain exists but processes silence — hence "EQ does nothing".
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const init = () => {
      if (graphRef.current) return;
      try {
        const ctx = new AudioContext();
        ctx.resume().catch(() => {});

        const source = ctx.createMediaElementSource(audio);
        const bands = eqBandsRef.current;

        const filters: BiquadFilterNode[] = bands.map((band, i) => {
          const f = ctx.createBiquadFilter();
          if (i === 0) {
            f.type = "lowshelf";
            f.Q.value = 0.7;
          } else if (i === bands.length - 1) {
            f.type = "highshelf";
            f.Q.value = 0.7;
          } else {
            f.type = "peaking";
            f.Q.value = EQ_Q;
          }
          f.frequency.value = band.cutoff;
          f.gain.value = 0;
          return f;
        });

        source.connect(filters[0]);
        for (let i = 0; i < filters.length - 1; i++) {
          filters[i].connect(filters[i + 1]);
        }
        filters[filters.length - 1].connect(ctx.destination);

        graphRef.current = { ctx, filters };

        // Apply whatever EQ state is active at init time.
        const enabled = eqEnabledRef.current;
        const b = eqBandsRef.current;
        filters.forEach((f, idx) => {
          f.gain.value = enabled ? b[idx].gain : 0;
        });
      } catch (err) {
        console.warn("[EQ] Web Audio init failed:", err);
      }
    };

    const onPlay = () => {
      graphRef.current?.ctx.resume().catch(() => {});
      init();
    };

    audio.addEventListener("play", onPlay);
    if (!audio.paused) init();

    return () => {
      audio.removeEventListener("play", onPlay);
      graphRef.current?.ctx.close().catch(() => {});
      graphRef.current = null;
    };
  }, [audioRef]);

  // Real-time sync: push every EQ change to the filter parameters.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.filters.forEach((filter, i) => {
      filter.gain.value = eqEnabled ? eqBands[i].gain : 0;
    });
  }, [eqEnabled, eqBands]);
}
