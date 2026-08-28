import styled from "@emotion/styled";
import { IconNfc } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { nfcWriteTargetAtom } from "../atoms/nfc";
import { useNfcReady } from "../hooks/useNfc";
import { nfcPayloadFor } from "../lib/nfc";

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

export function WriteToNfcMenuItem({
  kind,
  id,
  label,
  sublabel,
  onDone,
}: {
  kind: "album" | "playlist";
  id: string;
  label: string;
  sublabel?: string;
  onDone: () => void;
}) {
  const setTarget = useSetAtom(nfcWriteTargetAtom);
  const { ready, reason } = useNfcReady();

  return (
    <Item
      disabled={!ready}
      title={reason ?? `Tap a tag to make it play “${label}”`}
      onClick={(e) => {
        e.stopPropagation();
        if (!ready) return;
        setTarget({ payload: nfcPayloadFor(kind, id), label, sublabel });
        onDone();
      }}
    >
      <IconNfc size={14} /> Write to NFC tag…
    </Item>
  );
}
