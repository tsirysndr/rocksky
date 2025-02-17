import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router";
import { shoutsAtom } from "../../../atoms/shouts";
import useShout from "../../../hooks/useShout";
import Shout from "./Shout";
import "./styles.css";

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
        [pathname]: data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((x: any) => !x.shouts.parent)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((x: any) => ({
            id: x.shouts.id,
            uri: x.shouts.uri,
            message: x.shouts.content,
            date: x.shouts.createdAt,
            liked: x.shouts.liked,
            likes: x.shouts.likes,
            user: {
              avatar: x.users.avatar,
              displayName: x.users.displayName,
              handle: x.users.handle,
            },
            // filter all replies
            replies: data
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((y: any) => y.shouts.parent === x.shouts.id)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((y: any) => ({
                id: y.shouts.id,
                uri: y.shouts.uri,
                message: y.shouts.content,
                date: y.shouts.createdAt,
                liked: y.shouts.liked,
                likes: y.shouts.likes,
                user: {
                  avatar: y.users.avatar,
                  displayName: y.users.displayName,
                  handle: y.users.handle,
                },
                replies: [], // Initialize replies as an empty array
              })),
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
        id: x.shouts.id,
        uri: x.shouts.uri,
        message: x.shouts.content,
        date: x.shouts.createdAt,
        liked: x.shouts.liked,
        likes: x.shouts.likes,
        user: {
          avatar: x.users.avatar,
          displayName: x.users.displayName,
          handle: x.users.handle,
        },
        replies: data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((y: any) => y.shouts.parent === x.shouts.id)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((y: any) => ({
            id: y.shouts.id,
            uri: y.shouts.uri,
            message: y.shouts.content,
            date: y.shouts.createdAt,
            liked: y.shouts.liked,
            likes: y.shouts.likes,
            user: {
              avatar: y.users.avatar,
              displayName: y.users.displayName,
              handle: y.users.handle,
            },
            replies: [], // Initialize replies as an empty array
          })),
      })),
    });
  };

  const renderShout = (shout) => (
    <div key={shout.id} className="shout-container">
      <Shout shout={shout} refetch={fetchShouts} />
      <div className="replies-container">
        {shout.replies.map((reply) => renderShout(reply))}
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 50 }}>
      {(shouts[pathname] || []).map((shout) => renderShout(shout))}
    </div>
  );
}

export default ShoutList;
