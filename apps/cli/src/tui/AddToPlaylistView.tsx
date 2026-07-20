import { useQuery } from "@tanstack/react-query";
import { Box, Text, useInput } from "ink";
import { useAtom, useAtomValue } from "jotai";
import React, { useState } from "react";
import { Cell, Ell } from "./Columns";
import { List } from "./List";
import {
  addTrackToPlaylist,
  createPlaylist,
  getCreds,
  getPlaylists,
} from "./navidrome";
import { queryClient } from "./queryClient";
import { addToPlaylistAtom, authAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

export function AddToPlaylistView() {
  const token = useAtomValue(authAtom);
  const [pending, setPending] = useAtom(addToPlaylistAtom);
  const [sel, setSel] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const credsQ = useQuery({
    queryKey: ["ndCreds", token],
    enabled: !!token,
    queryFn: () => getCreds(token),
  });
  const creds = credsQ.data ?? null;

  const playlistsQ = useQuery({
    queryKey: ["playlists", creds?.handle],
    enabled: !!creds,
    queryFn: () => getPlaylists(creds!),
  });
  const playlists = playlistsQ.data ?? [];

  function close() {
    setPending(null);
  }

  async function addTo(playlistId: string) {
    if (!creds || !pending) return;
    try {
      setNote("Adding…");
      await addTrackToPlaylist(creds, playlistId, pending.trackId);
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist", playlistId] });
      close();
    } catch (e: any) {
      setNote(`Error: ${e.message}`);
    }
  }

  useInput((input, key) => {
    if (creating) {
      if (key.escape) {
        setCreating(false);
        setName("");
        return;
      }
      if (key.return) {
        const n = name.trim();
        setCreating(false);
        setName("");
        if (n && creds && pending) {
          setNote(`Creating "${n}"…`);
          createPlaylist(creds, n)
            .then((id) => (id ? addTo(id) : setNote("Create failed")))
            .catch((e) => setNote(`Error: ${e.message}`));
        }
        return;
      }
      if (key.backspace || key.delete) return setName((s) => s.slice(0, -1));
      if (input && input >= " " && !key.ctrl && !key.meta)
        setName((s) => s + input);
      return;
    }

    if (key.escape) return close();
    if (input === "c") {
      setCreating(true);
      setName("");
      return;
    }
    if (key.upArrow || input === "k") return setSel((s) => Math.max(0, s - 1));
    if (key.downArrow || input === "j")
      return setSel((s) => Math.min(playlists.length - 1, s + 1));
    if (key.return) {
      const pl = playlists[sel];
      if (pl) void addTo(pl.id);
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text>
        <Text bold color={BLUE}>
          {"Add to playlist: "}
        </Text>
        <Text bold>{pending?.title ?? ""}</Text>
      </Text>

      {creating ? (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color={TEAL}>{"new playlist  "}</Text>
            <Text>{name}</Text>
            <Text color={BLUE}>▏</Text>
          </Box>
          <Text dimColor>Enter to create &amp; add · Esc to cancel</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {credsQ.isLoading || playlistsQ.isLoading ? (
            <Text color={VIOLET}>Loading playlists…</Text>
          ) : (
            <List
              items={playlists}
              selected={sel}
              height={12}
              emptyText="No playlists — press c to create one."
              renderItem={(pl, _i, active) => (
                <>
                  <Cell width={2}>
                    <Text color={active ? BLUE : VIOLET}>
                      {active ? "›" : " "}
                    </Text>
                  </Cell>
                  <Cell grow>
                    <Ell color={active ? BLUE : undefined} bold>
                      {pl.name}
                    </Ell>
                  </Cell>
                  <Cell width={12} right>
                    <Ell color={TEAL}>{`${pl.songCount} songs`}</Ell>
                  </Cell>
                </>
              )}
            />
          )}
          {note ? <Text color={BLUE}>{note}</Text> : null}
          <Text dimColor>Enter add · c new playlist · Esc cancel</Text>
        </Box>
      )}
    </Box>
  );
}
