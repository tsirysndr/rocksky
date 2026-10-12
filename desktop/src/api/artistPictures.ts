import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { isTauri } from "../lib/tauri";

export function useArtistPictures(names: readonly string[]) {
  const cache = useQueryClient();
  const unique = useMemo(
    () => [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort(),
    [names],
  );
  const query = useQuery({
    queryKey: ["artist-pictures", unique],
    queryFn: async () => {
      const found = await invoke<Record<string, string | null>>("artist_pictures", { names: unique });
      const out: Record<string, string> = {};
      for (const [name, path] of Object.entries(found)) if (path) out[name] = convertFileSrc(path);
      return out;
    },
    enabled: isTauri() && unique.length > 0,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const stop = listen("artist-pictures", () => {
      if (active) void cache.invalidateQueries({ queryKey: ["artist-pictures"] });
    });
    return () => {
      active = false;
      void stop.then((un) => un());
    };
  }, [cache]);
  return query.data ?? {};
}
