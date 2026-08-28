import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  NO_READER,
  type NfcStatus,
  nfcStatus,
  onNfcStatus,
} from "../lib/nfc";
import { isTauri } from "../lib/tauri";

const KEY = ["desktop", "nfc_status"];

/**
 * Reader availability. Seeded from the backend once, then kept live by the
 * `nfc://status` event the reader thread emits on every change — plugging a
 * reader in updates every menu without a refetch.
 */
export function useNfcStatus(): NfcStatus {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: nfcStatus,
    enabled: isTauri(),
    staleTime: Infinity,
  });

  useEffect(
    () => onNfcStatus((status) => queryClient.setQueryData(KEY, status)),
    [queryClient],
  );

  return data ?? NO_READER;
}

/** Whether a tag can be written right now, and why not when it can't. */
export function useNfcReady(): { ready: boolean; reason: string | null } {
  const status = useNfcStatus();
  if (!isTauri()) {
    return { ready: false, reason: "NFC tags need the Rocksky desktop app" };
  }
  if (!status.available) {
    return {
      ready: false,
      reason: status.error ?? "No smart-card service on this machine",
    };
  }
  if (status.readers.length === 0) {
    return { ready: false, reason: "Connect an NFC reader to write tags" };
  }
  return { ready: true, reason: null };
}
