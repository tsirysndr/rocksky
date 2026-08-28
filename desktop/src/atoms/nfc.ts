import { atom } from "jotai";

/**
 * The album or playlist waiting to be burned onto a tag. Set by the "Write to
 * NFC tag" menu entry; the write modal owns it from there and clears it when
 * the user closes the dialog.
 */
export const nfcWriteTargetAtom = atom<{
  /** The NDEF URIs to store, one record each, in the order to try them. */
  payloads: string[];
  /** Shown in the dialog so the user knows which tag they are making. */
  label: string;
  sublabel?: string;
  /**
   * False when there is no record URI to write, only a library id — the tag
   * then only works in this user's own library, and the dialog says so rather
   * than promising a portable tag.
   */
  portable: boolean;
} | null>(null);
