import { atom } from "jotai";

/**
 * The album or playlist waiting to be burned onto a tag. Set by the "Write to
 * NFC tag" menu entry; the write modal owns it from there and clears it when
 * the user closes the dialog.
 */
export const nfcWriteTargetAtom = atom<{
  /** The NDEF URI to store. */
  payload: string;
  /** Shown in the dialog so the user knows which tag they are making. */
  label: string;
  sublabel?: string;
} | null>(null);
