import { useCallback } from "react";
import type { GifEmbed } from "../api/klipy";
import {
  cancelReport as apiCancelReport,
  deleteShout as apiDelete,
  getReplies as apiGetReplies,
  getShouts as apiGetShouts,
  reply as apiReply,
  reportShout as apiReport,
  shout as apiShout,
} from "../api/shouts";

function useShout() {
  const shout = useCallback(
    (uri: string, message: string, gif?: GifEmbed) =>
      apiShout(uri, message, gif),
    [],
  );

  const getShouts = useCallback((uri: string) => apiGetShouts(uri), []);

  const reply = useCallback(
    (uri: string, message: string, gif?: GifEmbed) =>
      apiReply(uri, message, gif),
    [],
  );

  const getReplies = useCallback((uri: string) => apiGetReplies(uri), []);

  const reportShout = useCallback((uri: string) => apiReport(uri), []);

  const deleteShout = useCallback((uri: string) => apiDelete(uri), []);

  const cancelReport = useCallback((uri: string) => apiCancelReport(uri), []);

  return {
    shout,
    getShouts,
    reply,
    getReplies,
    reportShout,
    deleteShout,
    cancelReport,
  };
}

export default useShout;
