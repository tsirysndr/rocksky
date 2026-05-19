import { useCallback } from "react";
import {
  shout as apiShout,
  getShouts as apiGetShouts,
  reply as apiReply,
  getReplies as apiGetReplies,
  reportShout as apiReport,
  deleteShout as apiDelete,
  cancelReport as apiCancelReport,
} from "../api/shouts";

function useShout() {
  const shout = useCallback(
    (uri: string, message: string) => apiShout(uri, message),
    [],
  );

  const getShouts = useCallback((uri: string) => apiGetShouts(uri), []);

  const reply = useCallback(
    (uri: string, message: string) => apiReply(uri, message),
    [],
  );

  const getReplies = useCallback((uri: string) => apiGetReplies(uri), []);

  const reportShout = useCallback((uri: string) => apiReport(uri), []);

  const deleteShout = useCallback((uri: string) => apiDelete(uri), []);

  const cancelReport = useCallback((uri: string) => apiCancelReport(uri), []);

  return { shout, getShouts, reply, getReplies, reportShout, deleteShout, cancelReport };
}

export default useShout;
