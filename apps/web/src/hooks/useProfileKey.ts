import { useParams } from "@tanstack/react-router";
import { useProfileByDidQuery } from "./useProfile";

/**
 * did of the profile currently being viewed — the key profile UI state (tab,
 * time range) is persisted under. The route param can be either a did or a
 * handle, so prefer the did resolved by the profile query.
 */
export const useProfileKey = (): string | undefined => {
  const { did } = useParams({ strict: false });
  const { data } = useProfileByDidQuery(did!);
  return data?.did || did;
};
