import { useQuery } from "@tanstack/react-query";
import { RockskyClient } from "client";
import { Box, Text, useInput } from "ink";
import { useAtom, useAtomValue } from "jotai";
import React, { useEffect, useState } from "react";
import { Cell, Ell } from "./Columns";
import { fmtDuration } from "./format";
import { List } from "./List";
import { rockskyLink } from "./links";
import { streamAndPlay } from "./playback";
import { type QueueItem } from "./player";
import { authAtom, searchContextAtom, searchOpenAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";
import { useDebouncedValue } from "./useDebouncedValue";

interface UploadTrackRow {
  kind: "uploadTrack";
  item: QueueItem;
}
interface GlobalRow {
  kind: "global";
  gtype: string;
  primary: string;
  secondary?: string;
  link?: string;
}
type SearchRow = UploadTrackRow | GlobalRow;

async function searchUploads(token: string, q: string): Promise<SearchRow[]> {
  const client = new RockskyClient(token);
  const rows = await client.getUploads({ q, limit: 50 });
  return (rows || []).map((r: any) => ({
    kind: "uploadTrack",
    item: {
      uploadId: r.upload.id,
      title: r.track.title,
      artist: r.track.artist,
      album: r.track.album,
      albumArtist: r.track.albumArtist,
      albumArt: r.track.albumArt,
      duration: r.track.duration,
      mimeType: r.upload.mimeType,
      uri: r.track.uri,
    },
  }));
}

async function searchGlobal(q: string): Promise<SearchRow[]> {
  const client = new RockskyClient();
  const res = await client.search(q, { size: 30 });
  return (res.hits || []).map((h: any): GlobalRow => {
    const gtype = h?._federation?.indexUid || "result";
    if (gtype === "users") {
      return {
        kind: "global",
        gtype,
        primary: h.handle,
        secondary: h.displayName,
        link: h.did ? `https://rocksky.app/profile/${h.did}` : undefined,
      };
    }
    if (gtype === "artists") {
      return { kind: "global", gtype, primary: h.name, link: rockskyLink(h.uri) };
    }
    // albums + tracks
    return {
      kind: "global",
      gtype,
      primary: h.title,
      secondary: h.artist,
      link: rockskyLink(h.uri),
    };
  });
}

export function SearchOverlay({ height }: { height: number }) {
  const [, setOpen] = useAtom(searchOpenAtom);
  const [context, setContext] = useAtom(searchContextAtom);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState("");
  const token = useAtomValue(authAtom);
  const debouncedQuery = useDebouncedValue(query, 250);
  const q = debouncedQuery.trim();

  // Debounced query + query-key caching: identical queries are served instantly.
  const { data: results = [], isFetching: loading } = useQuery<SearchRow[]>({
    queryKey: ["search", context, q],
    enabled: q.length > 0 && !(context === "uploads" && !token),
    queryFn: () =>
      context === "uploads" ? searchUploads(token!, q) : searchGlobal(q),
  });

  useEffect(() => {
    setSelected(0);
  }, [q, context]);

  function close() {
    setOpen(false);
    setQuery("");
    setNote("");
  }

  async function onSelect() {
    const row = results[selected];
    if (!row) return;
    if (row.kind === "uploadTrack") {
      const tracks = results.filter(
        (r): r is UploadTrackRow => r.kind === "uploadTrack",
      );
      try {
        setNote("Buffering…");
        await streamAndPlay(
          token!,
          tracks.map((t) => t.item),
          tracks.indexOf(row),
        );
        close();
      } catch (e: any) {
        setNote(`Playback error: ${e.message}`);
      }
      return;
    }
    if (row.link) {
      try {
        const open = (await import("open")).default;
        await open(row.link);
      } catch {
        // ignore — nothing else to do in a terminal
      }
    }
    close();
  }

  useInput((input, key) => {
    if (key.escape) return close();
    if (key.tab || input === "\t") {
      setContext((c) => (c === "global" ? "uploads" : "global"));
      setSelected(0);
      return;
    }
    if (key.return) return void onSelect();
    if (key.upArrow) return setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow)
      return setSelected((s) => Math.min(results.length - 1, s + 1));
    if (key.backspace || key.delete) return setQuery((q) => q.slice(0, -1));
    // Only append visible characters (exclude Tab/newline and other controls).
    if (input && input >= " " && !key.ctrl && !key.meta)
      setQuery((q) => q + input);
  });

  const uploadsNoAuth = context === "uploads" && !token;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text bold color={context === "uploads" ? BLUE : VIOLET}>
          {context === "uploads" ? " Search my uploads " : " Search Rocksky "}
        </Text>
        <Text dimColor>{"  Tab switch context · Esc close"}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={TEAL}>{"/ "}</Text>
        <Text>{query}</Text>
        <Text color={BLUE}>▏</Text>
        {loading ? <Text dimColor>{"  searching…"}</Text> : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {uploadsNoAuth ? (
          <Text color={VIOLET}>
            {"Log in with `rocksky login <handle>` to search your uploads."}
          </Text>
        ) : (
          <List
            items={results}
            selected={selected}
            height={height}
            emptyText={query ? "No matches." : "Type to search…"}
            renderItem={(row, _idx, active) => (
              <SearchRowLine row={row} active={active} />
            )}
          />
        )}
        {note ? <Text color={BLUE}>{note}</Text> : null}
      </Box>
    </Box>
  );
}

function SearchRowLine({ row, active }: { row: SearchRow; active: boolean }) {
  if (row.kind === "uploadTrack") {
    const t = row.item;
    return (
      <>
        <Cell width={2}>
          <Text color={active ? BLUE : VIOLET}>{active ? "▶" : " "}</Text>
        </Cell>
        <Cell grow>
          <Ell color={active ? BLUE : undefined} bold>
            {t.title}
          </Ell>
        </Cell>
        <Cell width={24}>
          <Ell dimColor>{t.artist}</Ell>
        </Cell>
        <Cell width={6} right>
          <Ell color={TEAL}>{t.duration ? fmtDuration(t.duration) : ""}</Ell>
        </Cell>
      </>
    );
  }
  return (
    <>
      <Cell width={2}>
        <Text color={active ? BLUE : VIOLET}>{active ? "›" : " "}</Text>
      </Cell>
      <Cell width={8}>
        <Ell color={TEAL}>{row.gtype.replace(/s$/, "")}</Ell>
      </Cell>
      <Cell grow>
        <Ell color={active ? BLUE : undefined} bold>
          {row.primary}
        </Ell>
      </Cell>
      <Cell width={24}>
        <Ell dimColor>{row.secondary ?? ""}</Ell>
      </Cell>
    </>
  );
}
