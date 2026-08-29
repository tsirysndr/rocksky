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
 * What a tag or card will point at.
 *
 * Albums and playlists are records with an id behind them; favorites are a
 * query owned by a person, so the tag carries their DID instead — see
 * nfcFavoritesPayloads.
 */
export type NfcWriteTarget =
  | {
      kind: "album" | "playlist";
      id: string;
      /** The record's AT-URI, when it has one — this is what makes it portable. */
      uri?: string | null;
    }
  | { kind: "favorites"; did: string };

/**
 * The records a target goes on a tag or card as, and whether it will work
 * outside the owner's library. Shared with the T shortcut so a keyboard write
 * and a menu write cannot drift apart.
 */
export function payloadsForTarget(target: NfcWriteTarget): {
  payloads: string[];
  portable: boolean;
} {
  // A favorites target names a person, not a server row, so it travels with
  // them: portable in the same sense a record URI is.
  if (target.kind === "favorites") {
    return { payloads: nfcFavoritesPayloads(target.did), portable: true };
  }
  return {
    payloads: nfcPayloadsFor(target.kind, { uri: target.uri, id: target.id }),
    portable: isPortableRef({ uri: target.uri }),
  };
}

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

  const { payloads, portable } = payloadsForTarget(target);

  const unwritable =
    payloads.length === 0 ? "Nothing to write yet" : null;

  return (
    <Item
      disabled={!ready || !!unwritable}
      title={
        reason ??
        unwritable ??
        (target.kind === "favorites"
          ? `Tap a tag or insert a card to play “${label}” wherever you’re signed in`
          : portable
            ? `Tap a tag or insert a card to play “${label}” on any Rocksky player`
            : `Tap a tag or insert a card to play “${label}”. This ${target.kind} has no published record yet, so it will only work in your own library.`)
      }
      onClick={(e) => {
        e.stopPropagation();
        if (!ready || unwritable) return;
        setTarget({ payloads, label, sublabel, portable });
        onDone();
      }}
    >
      <IconNfc size={14} /> Write to NFC tag or card…
    </Item>
  );
}
