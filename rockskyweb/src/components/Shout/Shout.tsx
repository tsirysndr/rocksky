import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "baseui/button";
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
  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<z.infer<typeof ShoutSchema>>({
    mode: "onChange",
    resolver: zodResolver(ShoutSchema),
    defaultValues: {
      message: "",
    },
  });
  const { did, rkey } = useParams<{ did: string; rkey: string }>();
  const location = useLocation();

  const onShout = async ({ message }: z.infer<typeof ShoutSchema>) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [location.pathname]: data.map((x: any) => ({
        uri: (x.shouts || x).uri,
        message: (x.shouts || x).content,
        date: (x.shouts || x).createdAt,
        user: {
          avatar: (x.users || x.authors).avatar,
          displayName: (x.users || x.authors).displayName,
          handle: (x.users || x.authors).handle,
        },
      })),
    });

    reset();
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
                      width: "770px",
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
            <Button
              disabled={
                watch("message").length === 0 || watch("message").length > 1000
              }
              onClick={handleSubmit(onShout)}
            >
              Post Shout
            </Button>
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
