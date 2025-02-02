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
    }).then((res) => res.json());

  const { data, error, isLoading } = useSWR("/profile", fetcher);

  if (error && localStorage.getItem("did")) {
    localStorage.removeItem("did");
    window.location.href = "/";
  }

  useEffect(() => {
    if (data) {
      setProfile({
        avatar: `https://cdn.bsky.app/img/avatar/plain/${localStorage.getItem(
          "did"
        )}/${data.avatar.ref["$link"]}@jpeg`,
        displayName: data.displayName,
        handle: data.handle,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return { data, error, isLoading };
}

export default useProfile;
