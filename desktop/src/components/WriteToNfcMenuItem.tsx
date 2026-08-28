import styled from "@emotion/styled";
import { IconNfc } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { nfcWriteTargetAtom } from "../atoms/nfc";
import { useNfcReady } from "../hooks/useNfc";
import { isPortableRef, nfcFavoritesPayloads, nfcPayloadsFor } from "../lib/nfc";

// Opens the write dialog, which owns the "tap a tag" wait. Shaped like
// AddToPlaylistMenu so it drops into any of the library dropdowns.
//
// The entry stays visible with no reader attached rather than disappearing:
// the point is discoverability, and a title explains what to plug in.

const Item = styled.button`
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.8125rem;
  font-family: RockfordSansMedium;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover:not(:disabled) {
    background: var(--color-menu-hover);
  }
  &:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }
`;

/**
 * What a tag will point at.
 *
 * Albums and playlists are records with an id behind them; favorites are a
 * query owned by a person, so the tag carries their DID instead — see
 * nfcFavoritesPayloads.
 */
export type NfcWriteTarget =
  | {
      kind: "album" | "playlist";
      id: string;
      /** The record's AT-URI, when it has one — this is what makes the tag portable. */
      uri?: string | null;
    }
  | { kind: "favorites"; did: string };

export function WriteToNfcMenuItem({
  target,
  label,
  sublabel,
  onDone,
}: {
  target: NfcWriteTarget;
  label: string;
  sublabel?: string;
  onDone: () => void;
}) {
  const setTarget = useSetAtom(nfcWriteTargetAtom);
  const { ready, reason } = useNfcReady();

  // A favorites tag names a person, not a server row, so it travels with them:
  // portable in the same sense a record URI is.
  const payloads =
    target.kind === "favorites"
      ? nfcFavoritesPayloads(target.did)
      : nfcPayloadsFor(target.kind, { uri: target.uri, id: target.id });
  const portable =
    target.kind === "favorites" ? true : isPortableRef({ uri: target.uri });

  const unwritable =
    payloads.length === 0 ? "Nothing to write to a tag yet" : null;

  return (
    <Item
      disabled={!ready || !!unwritable}
      title={
        reason ??
        unwritable ??
        (target.kind === "favorites"
          ? `Tap a tag to make it play “${label}” wherever you’re signed in`
          : portable
            ? `Tap a tag to make it play “${label}” on any Rocksky player`
            : `Tap a tag to make it play “${label}”. This ${target.kind} has no published record yet, so the tag will only work in your own library.`)
      }
      onClick={(e) => {
        e.stopPropagation();
        if (!ready || unwritable) return;
        setTarget({ payloads, label, sublabel, portable });
        onDone();
      }}
    >
      <IconNfc size={14} /> Write to NFC tag…
    </Item>
  );
}
