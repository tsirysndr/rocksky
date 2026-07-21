import { RockskyClient } from "client";
import { Box, Text, useInput } from "ink";
import { useAtom, useAtomValue } from "jotai";
import React, { useState } from "react";
import { Cell, Ell } from "./Columns";
import { fmtDuration } from "./format";
import { List } from "./List";
import { exportQueue, getCreds } from "./navidrome";
import { jumpTo } from "./playback";
import { playerController } from "./player";
import { queryClient } from "./queryClient";
import { authAtom, playerStatusAtom, queueOpenAtom, queueVersionAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

export function QueueView({ height }: { height: number }) {
  const [, setOpen] = useAtom(queueOpenAtom);
  const token = useAtomValue(authAtom);
  const status = useAtomValue(playerStatusAtom);
  useAtomValue(queueVersionAtom); // re-render on queue changes
  const items = playerController.queueItems;
  const playingIndex = status?.index ?? -1;
  const [selected, setSelected] = useState(
    playingIndex >= 0 ? playingIndex : 0,
  );
  const [exporting, setExporting] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  async function saveAsPlaylist(playlistName: string) {
    try {
      // Resolve every queue item to its Subsonic song id (tracks.xata_id).
      // Items played this session already carry `trackId`; older ones restored
      // from a saved session may only have `uploadId`, so map those via the
      // uploads API.
      const trackIds = items.map((i) => i.trackId).filter(Boolean) as string[];
      const unresolvable = items.filter((i) => !i.trackId && !i.uploadId).length;
      const needResolve = items.filter((i) => !i.trackId && i.uploadId);
      let missed = 0;
      if (needResolve.length > 0 && token) {
        setNote("Resolving tracks…");
        const wanted = new Set(needResolve.map((i) => i.uploadId));
        const client = new RockskyClient(token);
        let offset = 0;
        while (wanted.size > 0 && offset < 5000) {
          const rows: any[] = await client.getUploads({ skip: offset, limit: 200 });
          if (!rows.length) break;
          for (const r of rows) {
            if (wanted.has(r.upload.id)) {
              trackIds.push(r.track.id);
              wanted.delete(r.upload.id);
            }
          }
          offset += rows.length;
          if (rows.length < 200) break;
        }
        missed = wanted.size;
      }

      const songIds = [...new Set(trackIds)]; // dedupe repeated tracks
      if (songIds.length === 0) {
        setNote("No exportable tracks in the queue.");
        return;
      }
      setNote(`Saving "${playlistName}"…`);
      const creds = await getCreds(token);
      if (!creds) {
        setNote("Sign in to save playlists.");
        return;
      }
      const { added, failed } = await exportQueue(creds, playlistName, songIds);
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      const skipped = failed + missed + unresolvable;
      setNote(
        skipped > 0
          ? `Saved "${playlistName}" — ${added} tracks (${skipped} skipped)`
          : `Saved "${playlistName}" (${added} tracks)`,
      );
    } catch (e: any) {
      setNote(`Error: ${e.message}`);
    }
  }

  useInput((input, key) => {
    if (exporting) {
      if (key.escape) {
        setExporting(false);
        setName("");
        return;
      }
      if (key.return) {
        const n = name.trim();
        setExporting(false);
        setName("");
        if (n) void saveAsPlaylist(n);
        return;
      }
      if (key.backspace || key.delete) return setName((s) => s.slice(0, -1));
      if (input && input >= " " && !key.ctrl && !key.meta)
        setName((s) => s + input);
      return;
    }

    if (key.escape || input === "Q") return setOpen(false);
    if (key.upArrow || input === "k")
      return setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow || input === "j")
      return setSelected((s) => Math.min(items.length - 1, s + 1));
    if (input === "d" || key.delete || key.backspace) {
      playerController.removeAt(selected);
      // Clamp selection to the shortened queue (also forces a re-render).
      setSelected((s) => Math.max(0, Math.min(s, items.length - 2)));
      return;
    }
    if (input === "s") {
      setExporting(true);
      setName("");
      return;
    }
    if (key.return) {
      if (token) void jumpTo(token, selected);
      setOpen(false);
    }
  });

  if (exporting) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={BLUE}>
          {" Save queue as playlist "}
        </Text>
        <Box marginTop={1}>
          <Text color={TEAL}>{"name  "}</Text>
          <Text>{name}</Text>
          <Text color={BLUE}>▏</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>{`${items.length} tracks · Enter to save · Esc to cancel`}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text bold color={BLUE}>
          {" Current Queue "}
        </Text>
        <Text dimColor>{`  ${items.length} track${items.length === 1 ? "" : "s"} · Enter jump · d remove · s save · Esc close`}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <List
          items={items}
          selected={selected}
          height={height}
          emptyText="The queue is empty — play something first."
          renderItem={(t, idx, active) => {
            const isPlaying = idx === playingIndex;
            return (
              <>
                <Cell width={2}>
                  <Text color={isPlaying ? TEAL : VIOLET}>
                    {isPlaying ? "♪" : active ? "›" : " "}
                  </Text>
                </Cell>
                <Cell grow>
                  <Ell color={active ? BLUE : undefined} bold={active || isPlaying}>
                    {t.title}
                  </Ell>
                </Cell>
                <Cell width={24}>
                  <Ell dimColor>{t.artist}</Ell>
                </Cell>
                <Cell width={6} right>
                  <Ell color={TEAL}>
                    {t.duration ? fmtDuration(t.duration) : ""}
                  </Ell>
                </Cell>
              </>
            );
          }}
        />
      </Box>
      {note ? <Text color={BLUE}>{note}</Text> : null}
    </Box>
  );
}
