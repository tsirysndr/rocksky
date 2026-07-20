import { useQuery } from "@tanstack/react-query";
import { Box, Text, useInput } from "ink";
import { useAtomValue } from "jotai";
import React, { useState } from "react";
import { Cell, Ell } from "./Columns";
import { fmtDuration } from "./format";
import { List } from "./List";
import {
  createPlaylist,
  deletePlaylist,
  getCreds,
  getPlaylist,
  getPlaylists,
  playEntries,
  removeTrackFromPlaylist,
  type PlaylistEntry,
} from "./navidrome";
import { queryClient } from "./queryClient";
import { shuffled } from "./shuffle";
import { authAtom } from "./store";
import { BLUE, TEAL, VIOLET } from "./theme";

export function PlaylistsView({
  isActive,
  height = 15,
}: {
  isActive: boolean;
  height?: number;
}) {
  const token = useAtomValue(authAtom);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [entrySel, setEntrySel] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  // Playlist pending delete confirmation.
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  const detailQ = useQuery({
    queryKey: ["playlist", detailId],
    enabled: !!creds && !!detailId,
    queryFn: () => getPlaylist(creds!, detailId!),
  });
  const entries: PlaylistEntry[] = detailQ.data?.entries ?? [];

  const refetchLists = () =>
    queryClient.invalidateQueries({ queryKey: ["playlists"] });
  const refetchDetail = () =>
    queryClient.invalidateQueries({ queryKey: ["playlist", detailId] });

  function doDelete(pl: { id: string; name: string }) {
    if (!creds) return;
    setNote(`Deleting "${pl.name}"…`);
    deletePlaylist(creds, pl.id)
      .then(() => {
        setNote("");
        setSel((s) => Math.max(0, Math.min(s, playlists.length - 2)));
        refetchLists();
      })
      .catch((e) => setNote(`Error: ${e.message}`));
  }

  useInput(
    (input, key) => {
      // --- delete confirmation ---
      if (confirmDelete) {
        if (key.return || input === "y" || input === "Y") {
          const target = confirmDelete;
          setConfirmDelete(null);
          doDelete(target);
        } else if (key.escape || input === "n" || input === "N") {
          setConfirmDelete(null);
        }
        return;
      }

      // --- create playlist (name input) ---
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
          if (n && creds) {
            setNote(`Creating "${n}"…`);
            createPlaylist(creds, n)
              .then(() => {
                setNote("");
                refetchLists();
              })
              .catch((e) => setNote(`Error: ${e.message}`));
          }
          return;
        }
        if (key.backspace || key.delete) return setName((s) => s.slice(0, -1));
        if (input && input >= " " && !key.ctrl && !key.meta)
          setName((s) => s + input);
        return;
      }

      // --- playlist detail ---
      if (detailId) {
        if (key.escape || key.backspace) {
          setDetailId(null);
          return;
        }
        if (key.upArrow || input === "k")
          return setEntrySel((s) => Math.max(0, s - 1));
        if (key.downArrow || input === "j")
          return setEntrySel((s) => Math.min(entries.length - 1, s + 1));
        if (key.return && creds) {
          void playEntries(creds, entries, entrySel);
          return;
        }
        if (input === "S" && creds && entries.length) {
          void playEntries(creds, shuffled(entries), 0);
          return;
        }
        if ((input === "d" || input === "x") && creds && entries[entrySel]) {
          setNote("Removing…");
          removeTrackFromPlaylist(creds, detailId, entrySel)
            .then(() => {
              setNote("");
              setEntrySel((s) => Math.max(0, Math.min(s, entries.length - 2)));
              refetchDetail();
            })
            .catch((e) => setNote(`Error: ${e.message}`));
        }
        return;
      }

      // --- playlist list ---
      if (key.upArrow || input === "k") setSel((s) => Math.max(0, s - 1));
      else if (key.downArrow || input === "j")
        setSel((s) => Math.min(playlists.length - 1, s + 1));
      else if (key.return) {
        const pl = playlists[sel];
        if (pl) {
          setDetailId(pl.id);
          setEntrySel(0);
        }
      } else if (input === "c") {
        setCreating(true);
        setName("");
      } else if (input === "d" || input === "x") {
        const pl = playlists[sel];
        if (pl && creds) setConfirmDelete({ id: pl.id, name: pl.name });
      }
    },
    { isActive },
  );

  if (!token) {
    return (
      <Text color={VIOLET}>
        {"Not signed in. Press A to sign in and manage your playlists."}
      </Text>
    );
  }
  if (credsQ.isLoading) return <Text color={VIOLET}>Connecting…</Text>;

  // Delete confirmation
  if (confirmDelete) {
    return (
      <Box flexDirection="column">
        <Text bold color={BLUE}>
          Delete playlist
        </Text>
        <Box marginTop={1}>
          <Text>
            {"Delete "}
            <Text bold color={VIOLET}>
              {confirmDelete.name}
            </Text>
            {"? This cannot be undone."}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>y / Enter to delete · n / Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  // Create prompt
  if (creating) {
    return (
      <Box flexDirection="column">
        <Text bold color={BLUE}>
          New playlist
        </Text>
        <Box marginTop={1}>
          <Text color={TEAL}>{"name  "}</Text>
          <Text>{name}</Text>
          <Text color={BLUE}>▏</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to create · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  // Detail view
  if (detailId) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color={BLUE}>
            {detailQ.data?.playlist?.name ?? "Playlist"}
          </Text>
          <Text dimColor>{`  ${entries.length} track${entries.length === 1 ? "" : "s"}`}</Text>
        </Box>
        {detailQ.isLoading ? (
          <Text color={VIOLET}>Loading…</Text>
        ) : (
          <List
            items={entries}
            selected={entrySel}
            height={height}
            emptyText="No playable tracks in this playlist."
            renderItem={(e, _i, active) => (
              <>
                <Cell width={2}>
                  <Text color={active ? BLUE : VIOLET}>{active ? "▶" : " "}</Text>
                </Cell>
                <Cell grow>
                  <Ell color={active ? BLUE : undefined} bold>
                    {e.title}
                  </Ell>
                </Cell>
                <Cell width={24}>
                  <Ell dimColor>{e.artist}</Ell>
                </Cell>
                <Cell width={6} right>
                  <Ell color={TEAL}>
                    {e.duration ? fmtDuration(e.duration * 1000) : ""}
                  </Ell>
                </Cell>
              </>
            )}
          />
        )}
        {note ? <Text color={BLUE}>{note}</Text> : null}
        <Text dimColor>
          Enter play · S shuffle · d remove · Esc back
        </Text>
      </Box>
    );
  }

  // List view
  return (
    <Box flexDirection="column">
      {playlistsQ.isLoading ? (
        <Text color={VIOLET}>Loading playlists…</Text>
      ) : (
        <List
          items={playlists}
          selected={sel}
          height={height}
          emptyText="No playlists yet — press c to create one."
          renderItem={(pl, _i, active) => (
            <>
              <Cell width={2}>
                <Text color={active ? BLUE : VIOLET}>{active ? "›" : " "}</Text>
              </Cell>
              <Cell grow>
                <Ell color={active ? BLUE : undefined} bold>
                  {pl.name}
                </Ell>
              </Cell>
              <Cell width={12} right>
                <Ell color={TEAL}>{`${pl.songCount} song${pl.songCount === 1 ? "" : "s"}`}</Ell>
              </Cell>
            </>
          )}
        />
      )}
      {note ? <Text color={BLUE}>{note}</Text> : null}
      <Text dimColor>Enter open · c create · d delete</Text>
    </Box>
  );
}
