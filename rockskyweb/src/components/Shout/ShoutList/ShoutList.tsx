/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router";
import { shoutsAtom } from "../../../atoms/shouts";
import useShout from "../../../hooks/useShout";
import Shout from "./Shout";

function ShoutList() {
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const { pathname } = useLocation();
  const { getShouts } = useShout();
  const { did, rkey } = useParams<{ did: string; rkey: string }>();

  useEffect(() => {
    fetchShouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getShouts, pathname, did, rkey]);

  const fetchShouts = async () => {
    let uri = `at://${did}`;

    if (pathname.startsWith("/profile")) {
      const data = await getShouts(uri);
      setShouts({
        ...shouts,
        [pathname]: processShouts(data),
      });
      return;
    }

    if (!did || !rkey) {
      return;
    }

    if (pathname.includes("app.rocksky.scrobble")) {
      uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
    }

    if (pathname.includes("app.rocksky.song")) {
      uri = `at://${did}/app.rocksky.song/${rkey}`;
    }

    if (pathname.includes("app.rocksky.album")) {
      uri = `at://${did}/app.rocksky.album/${rkey}`;
    }

    if (pathname.includes("app.rocksky.artist")) {
      uri = `at://${did}/app.rocksky.artist/${rkey}`;
    }

    const data = await getShouts(uri);
    setShouts({
      ...shouts,
      [pathname]: processShouts(data),
    });
  };

  const processShouts = (data: any) => {
    const mapShouts = (parentId: string | null) => {
      return data
        .filter((x: any) => x.shouts.parent === parentId)
        .map((x: any) => ({
          id: x.shouts.id,
          uri: x.shouts.uri,
          message: x.shouts.content,
          date: x.shouts.createdAt,
          liked: x.shouts.liked,
          reported: x.shouts.reported,
          likes: x.shouts.likes,
          user: {
            did: x.users.did,
            avatar: x.users.avatar,
            displayName: x.users.displayName,
            handle: x.users.handle,
          },
          replies: mapShouts(x.shouts.id).reverse(),
        }));
    };

    return mapShouts(null);
  };

  const renderShout = (shout: any) => {
    return (
      <div
        key={shout.id}
        className="relative pl-[20px] mb-[20px] before:content-[''] before:absolute before:left-[10px] before:top-0 before:bottom-0 before:w-[2px]"
      >
        <Shout shout={shout} refetch={fetchShouts} />
        <div className="ml-[20px] pl-[20px]">
          {(shout.replies || []).map((reply: any) => renderShout(reply))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 50 }}>
      {(shouts[pathname] || []).map((shout) => renderShout(shout))}
    </div>
  );
}

export default ShoutList;
