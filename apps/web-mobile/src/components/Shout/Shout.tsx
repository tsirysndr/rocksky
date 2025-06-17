/* eslint-disable @typescript-eslint/no-explicit-any */
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "baseui/button";
import { Spinner } from "baseui/spinner";
import { Textarea } from "baseui/textarea";
import { LabelLarge, LabelMedium } from "baseui/typography";
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useLocation, useParams } from "react-router";
import z from "zod";
import { profileAtom } from "../../atoms/profile";
import { shoutsAtom } from "../../atoms/shouts";
import { userAtom } from "../../atoms/user";
import useShout from "../../hooks/useShout";
import SignInModal from "../SignInModal";
import ShoutList from "./ShoutList";

const ShoutSchema = z.object({
  message: z.string().min(1).max(1000),
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
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  const onShout = async ({ message }: z.infer<typeof ShoutSchema>) => {
    setLoading(true);
    let uri = "";

    if (location.pathname.startsWith("/profile")) {
      uri = `at://${did}`;
    }

    if (location.pathname.includes("app.rocksky.song")) {
      uri = `at://${did}/app.rocksky.song/${rkey}`;
    }

    if (location.pathname.includes("app.rocksky.album")) {
      uri = `at://${did}/app.rocksky.album/${rkey}`;
    }

    if (location.pathname.includes("app.rocksky.artist")) {
      uri = `at://${did}/app.rocksky.artist/${rkey}`;
    }

    if (location.pathname.includes("app.rocksky.scrobble")) {
      uri = `at://${did}/app.rocksky.scrobble/${rkey}`;
    }

    await shout(uri, message);

    const data = await getShouts(uri);
    setShouts({
      ...shouts,
      [location.pathname]: processShouts(data),
    });

    setLoading(false);

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
    <div style={{ marginTop: 150 }}>
      <LabelLarge marginBottom={"10px"}>Shoutbox</LabelLarge>
      {profile && (
        <>
          <Controller
            name="message"
            control={control}
            render={({ field }) => (
              <Textarea
                {...field}
                placeholder={
                  props.type === "profile"
                    ? `@${profile?.handle}, leave a shout for @${user?.handle} ...`
                    : `@${profile?.handle}, share your thoughts about this ${props.type}`
                }
                resize="vertical"
                overrides={{
                  Input: {
                    style: {
                      width: "calc(95vw - 25px)",
                    },
                  },
                }}
                maxLength={1000}
              />
            )}
          />

          <div
            style={{
              marginTop: 15,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            {!loading && (
              <Button
                disabled={
                  watch("message").length === 0 ||
                  watch("message").length > 1000
                }
                onClick={handleSubmit(onShout)}
              >
                Post Shout
              </Button>
            )}
            {loading && <Spinner $size={25} $color="rgb(255, 40, 118)" />}
          </div>
        </>
      )}
      {!profile && (
        <LabelMedium marginTop={"20px"}>
          Want to share your thoughts?{" "}
          <span
            style={{ color: "rgb(255, 40, 118)", cursor: "pointer" }}
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
