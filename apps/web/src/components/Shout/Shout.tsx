/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { Button } from "baseui/button";
import { StatefulPopover, PLACEMENT } from "baseui/popover";
import { Spinner } from "baseui/spinner";
import { LabelLarge, LabelMedium } from "baseui/typography";
import { IconGif, IconX } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import z from "zod";
import { isVideoUrl, type MediaResult } from "../../api/klipy";
import { resolveMentionFacets } from "../../lib/richtext";
import { profileAtom } from "../../atoms/profile";
import { shoutsAtom } from "../../atoms/shouts";
import { userAtom } from "../../atoms/user";
import useShout from "../../hooks/useShout";
import MediaPicker from "./MediaPicker";
import MentionTextarea from "./MentionTextarea";
import SignInModal from "../SignInModal";
import ShoutList from "./ShoutList";

const ShoutSchema = z.object({
  message: z.string().max(1000),
});

interface ShoutProps {
  type?: "album" | "artist" | "song" | "playlist" | "profile";
}

function Shout(props: ShoutProps) {
  props = {
    type: "song",
    ...props,
  };
  const shouts = useAtomValue(shoutsAtom);
  const setShouts = useSetAtom(shoutsAtom);
  const [isOpen, setIsOpen] = useState(false);
  const profile = useAtomValue(profileAtom);
  const user = useAtomValue(userAtom);
  const { shout, getShouts } = useShout();
  const { control, handleSubmit, watch, reset } = useForm<
    z.infer<typeof ShoutSchema>
  >({
    mode: "onChange",
    resolver: zodResolver(ShoutSchema),
    defaultValues: {
      message: "",
    },
  });
  const { did, rkey } = useParams({ strict: false });
  const location = window.location;
  const [loading, setLoading] = useState(false);
  const [gif, setGif] = useState<MediaResult | null>(null);

  const onShout = async ({ message }: z.infer<typeof ShoutSchema>) => {
    if (message.trim().length === 0 && !gif) {
      return;
    }
    setLoading(true);
    let uri = "";

    if (location.pathname.startsWith("/profile")) {
      uri = `at://${did}`;
    }

    if (location.pathname.includes("/song/")) {
      uri = `at://${did}/app.rocksky.song/${rkey}`;
    }

    if (location.pathname.includes("/album/")) {
      uri = `at://${did}/app.rocksky.album/${rkey}`;
    }

    if (location.pathname.includes("/artist/")) {
      uri = `at://${did}/app.rocksky.artist/${rkey}`;
    }

    if (location.pathname.includes("/scrobble/")) {
      uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
    }

    const gifEmbed = gif
      ? {
          url: gif.url,
          previewUrl: gif.previewUrl,
          alt: gif.alt,
          width: gif.width,
          height: gif.height,
        }
      : undefined;

    const facets = message.trim() ? await resolveMentionFacets(message) : [];

    await shout(uri, message, gifEmbed, facets.length ? facets : undefined);

    const data = await getShouts(uri);
    setShouts({
      ...shouts,
      [location.pathname]: processShouts(data),
    });

    setLoading(false);
    setGif(null);
    reset();
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

  return (
    <div className="mt-[150px]">
      <LabelLarge marginBottom={"10px"} className="!text-[var(--color-text)]">
        Shoutbox
      </LabelLarge>
      {profile && (
        <>
          <Controller
            name="message"
            control={control}
            render={({ field }) => (
              <MentionTextarea
                value={field.value}
                onChange={field.onChange}
                placeholder={
                  props.type === "profile"
                    ? `@${profile?.handle}, leave a shout for @${user?.handle} ...`
                    : `@${profile?.handle}, share your thoughts about this ${props.type}`
                }
                resize="vertical"
                overrides={{
                  Input: {
                    style: {
                      width: "770px",
                      color: "var(--color-text)",
                      backgroundColor: "var(--color-input-background)",
                      caretColor: "var(--color-text)",
                    },
                  },
                  InputContainer: {
                    style: {
                      backgroundColor: "var(--color-input-background)",
                      borderColor: "var(--color-input-background)",
                    },
                  },
                  Root: {
                    style: {
                      backgroundColor: "var(--color-input-background)",
                      border: "none !important",
                    },
                  },
                }}
                maxLength={1000}
              />
            )}
          />

          {gif && (
            <div className="mt-[10px] relative w-fit max-w-[220px] overflow-hidden rounded-[12px] border border-[var(--color-input-background)]">
              {isVideoUrl(gif.url) ? (
                <video
                  src={gif.url}
                  className="block w-full h-auto"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={gif.previewUrl ?? gif.url}
                  alt={gif.alt ?? ""}
                  className="block w-full h-auto"
                />
              )}
              <button
                type="button"
                aria-label="Remove media"
                onClick={() => setGif(null)}
                className="absolute right-[6px] top-[6px] flex h-[24px] w-[24px] items-center justify-center rounded-full bg-black/60 text-white cursor-pointer border-none hover:bg-black/80"
              >
                <IconX size={14} />
              </button>
            </div>
          )}

          <div className="mt-[15px] flex justify-between items-center">
            <StatefulPopover
              placement={PLACEMENT.bottomLeft}
              overrides={{
                Body: {
                  style: {
                    zIndex: 3,
                    backgroundColor: "transparent",
                    boxShadow: "none",
                  },
                },
                Inner: {
                  style: {
                    backgroundColor: "transparent",
                    borderRadius: "12px",
                  },
                },
              }}
              content={({ close }) => (
                <MediaPicker
                  onSelect={(m) => {
                    setGif(m);
                    close();
                  }}
                  onClose={close}
                />
              )}
            >
              <button
                type="button"
                aria-label="Add a GIF, sticker or clip"
                className="flex items-center gap-[4px] rounded-full px-[10px] py-[5px] text-[13px] cursor-pointer border-none bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-input-background)] hover:text-[var(--color-text)]"
              >
                <IconGif size={20} />
              </button>
            </StatefulPopover>

            {!loading && (
              <Button
                disabled={
                  (watch("message").length === 0 && !gif) ||
                  watch("message").length > 1000
                }
                onClick={handleSubmit(onShout)}
                overrides={{
                  BaseButton: {
                    style: ({ $disabled }) => ({
                      backgroundColor: "var(--color-purple) !important",
                      opacity: $disabled ? 0.4 : 1,
                      color: "var(--color-button-text) !important",
                      borderRadius: "2px",
                    }),
                  },
                }}
              >
                Post Shout
              </Button>
            )}
            {loading && <Spinner $size={25} $color="rgb(255, 40, 118)" />}
          </div>
        </>
      )}
      {!profile && (
        <LabelMedium marginTop={"20px"} className="!text-[var(--color-text)]">
          Want to share your thoughts?{" "}
          <span
            className="text-[var(--color-primary)] cursor-pointer"
            onClick={() => setIsOpen(true)}
          >
            Sign in
          </span>{" "}
          to leave a shout.
        </LabelMedium>
      )}
      <ShoutList />
      <SignInModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}

export default Shout;
