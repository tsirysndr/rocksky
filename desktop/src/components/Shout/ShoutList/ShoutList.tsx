/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams, useRouter, useRouterState } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { shoutsAtom } from "../../../atoms/shouts";
import useShout from "../../../hooks/useShout";
import Shout from "./Shout";

function ShoutList() {
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const {
    state: {
      location: { pathname },
    },
  } = useRouter();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const { getShouts } = useShout();
  const { did, rkey } = useParams({ strict: false });
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handledHashRef = useRef<string>("");

  useEffect(() => {
    fetchShouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getShouts, pathname, did, rkey]);

  // Scroll to and briefly highlight a shout deep-linked via `#shout-<id>`
  // (e.g. from a notification), once its list has loaded into the DOM.
  useEffect(() => {
    const raw = (hash ?? "").replace(/^#/, "");
    if (!raw.startsWith("shout-") || handledHashRef.current === raw) return;
    if (!(shouts[pathname] || []).length) return;
    const id = raw.slice("shout-".length);
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`shout-${id}`);
      if (!el) return;
      handledHashRef.current = raw;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(id);
    });
    return () => cancelAnimationFrame(raf);
  }, [shouts, pathname, hash]);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightId]);

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

    if (pathname.includes("/scrobble/")) {
      uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
    }

    if (pathname.includes("/song/")) {
      uri = `at://${did}/app.rocksky.song/${rkey}`;
    }

    if (pathname.includes("/album/")) {
      uri = `at://${did}/app.rocksky.album/${rkey}`;
    }

    if (pathname.includes("/artist/")) {
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
          gif: x.shouts.gifUrl
            ? {
                url: x.shouts.gifUrl,
                previewUrl: x.shouts.gifPreviewUrl,
                alt: x.shouts.gifAlt,
                width: x.shouts.gifWidth,
                height: x.shouts.gifHeight,
              }
            : undefined,
          facets: x.shouts.facets ?? undefined,
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
        id={`shout-${shout.id}`}
        className={`relative pl-[20px] mb-[20px] rounded-[8px] transition-colors before:content-[''] before:absolute before:left-[10px] before:top-0 before:bottom-0 before:w-[2px] ${
          highlightId === shout.id ? "bg-[var(--color-menu-hover)]" : ""
        }`}
      >
        <Shout shout={shout} refetch={fetchShouts} />
        <div className="ml-[20px] pl-[20px]">
          {(shout.replies || []).map((reply: any) => renderShout(reply))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-[50px]">
      {(shouts[pathname] || []).map((shout) => renderShout(shout))}
    </div>
  );
}

export default ShoutList;
