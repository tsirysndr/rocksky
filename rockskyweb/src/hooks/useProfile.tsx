import { useSetAtom } from "jotai";
import { useEffect } from "react";
import useSWR from "swr";
import { profileAtom } from "../atoms/profile";
import { API_URL } from "../consts";

function useProfile() {
  const setProfile = useSetAtom(profileAtom);

  const fetcher = (path: string) =>
    fetch(`${API_URL}${path}`, {
      method: "GET",
      headers: {
        "session-did": localStorage.getItem("did")!,
      },
    }).then((res) => res.text());

  const { data, error, isLoading } = useSWR("/profile", fetcher);

  useEffect(() => {
    if (data !== "Unauthorized" && data) {
      const profile = JSON.parse(data);
      setProfile({
        avatar: `https://cdn.bsky.app/img/avatar/plain/${localStorage.getItem(
          "did"
        )}/${profile.avatar.ref["$link"]}@jpeg`,
        displayName: profile.displayName,
        handle: profile.handle,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (
    !data ||
    data === "Unauthorized" ||
    (error && localStorage.getItem("did"))
  ) {
    return { data: null, error, isLoading };
  }

  return { data: JSON.parse(data), error, isLoading };
}

export default useProfile;
