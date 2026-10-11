import { useEffect, useState } from "react";
import { requestWaveform } from "../../modules/rocksky-engine";

export function useWaveform(key: string, enabled: boolean, source: () => Promise<string | null>) {
  const [result, setResult] = useState<{ key: string; peaks: number[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResult(null);
    // Cancels obsolete Rust analysis, including when switching to live radio.
    void requestWaveform("").catch(() => {});
    if (enabled) {
      void source().then(async (url) => {
        if (cancelled || !url) return;
        const poll = async () => {
          if (cancelled) return;
          try {
            const result = await requestWaveform(url);
            if (cancelled) return;
            if (result.status === "ready" && result.peaks?.length) {
              setResult({ key, peaks: result.peaks });
            } else if (result.status === "pending") {
              timer = setTimeout(poll, 1000);
            }
          } catch { /* A waveform is optional; playback stays available. */ }
        };
        await poll();
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void requestWaveform("").catch(() => {});
    };
    // Source is a snapshot resolver. Its identity changes on progress renders;
    // key includes device, queue position and track identity instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return result?.key === key ? result.peaks : null;
}
