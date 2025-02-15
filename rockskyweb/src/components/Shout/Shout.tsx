import { Button } from "baseui/button";
import { Textarea } from "baseui/textarea";
import { LabelLarge, LabelMedium } from "baseui/typography";
import { useAtomValue } from "jotai";
import { profileAtom } from "../../atoms/profile";
import { userAtom } from "../../atoms/user";

interface ShoutProps {
  type?: "album" | "artist" | "song" | "playlist" | "profile";
}

function Shout(props: ShoutProps) {
  props = {
    type: "song",
    ...props,
  };
  const profile = useAtomValue(profileAtom);
  const user = useAtomValue(userAtom);
  return (
    <div style={{ marginTop: 150 }}>
      <LabelLarge marginBottom={"10px"}>Shoutbox</LabelLarge>
      {profile && (
        <>
          <Textarea
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
          <div
            style={{
              marginTop: 15,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Button disabled>Post Shout</Button>
          </div>
        </>
      )}
      {!profile && (
        <LabelMedium marginTop={"20px"}>
          Want to share your thoughts? Sign in to leave a shout.
        </LabelMedium>
      )}
    </div>
  );
}

export default Shout;
