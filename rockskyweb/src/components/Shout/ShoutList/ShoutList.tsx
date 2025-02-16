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
    const fetchShouts = async () => {
      let uri = `at://${did}`;

      if (pathname.startsWith("/profile")) {
        const data = await getShouts(uri);
        setShouts({
          ...shouts,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [pathname]: data.map((x: any) => ({
            uri: x.shouts.uri,
            message: x.shouts.content,
            date: x.shouts.createdAt,
            user: {
              avatar: x.users.avatar,
              displayName: x.users.displayName,
              handle: x.users.handle,
            },
          })),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [pathname]: data.map((x: any) => ({
          uri: x.shouts.uri,
          message: x.shouts.content,
          date: x.shouts.createdAt,
          user: {
            avatar: x.users.avatar,
            displayName: x.users.displayName,
            handle: x.users.handle,
          },
        })),
      });
    };
    fetchShouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getShouts, pathname, did, rkey]);

  return (
    <div style={{ marginTop: 50 }}>
      {(shouts[pathname] || []).map((shout) => (
        <Shout shout={shout} />
      ))}
    </div>
  );
}

export default ShoutList;
