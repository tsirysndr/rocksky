import { Avatar } from "baseui/avatar";
import { Block } from "baseui/block";
import { StatefulPopover, TRIGGER_TYPE } from "baseui/popover";
import { LabelMedium, LabelSmall } from "baseui/typography";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import useProfile from "../../hooks/useProfile";
import NowPlaying from "./NowPlaying";

export type HandleProps = {
  link: string;
  did: string;
};

function Handle(props: HandleProps) {
  const { link, did } = props;
  const [profile, setProfile] = useState<{
    handle: string;
    avatar: string;
    displayName: string;
    createdAt: string;
  } | null>(null);
  const { getProfileByDid } = useProfile();

  useEffect(() => {
    const getProfile = async () => {
      const data = await getProfileByDid(did);
      setProfile({
        avatar: data.avatar,
        displayName: data.display_name,
        handle: data.handle,
        createdAt: data.xata_createdat,
      });
    };
    getProfile();
  }, []);

  return (
    <>
      <StatefulPopover
        content={() => (
          <Block
            padding={"15px"}
            backgroundColor={"#fff"}
            style={{
              borderRadius: "12px",
              width: "340px",
              border: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Link to={link} style={{ textDecoration: "none" }}>
                <Avatar
                  src={profile?.avatar}
                  name={profile?.displayName}
                  size={"60px"}
                />
              </Link>
              <div style={{ marginLeft: "16px" }}>
                <Link to={link} style={{ textDecoration: "none" }}>
                  <LabelMedium marginTop={"10px"}>
                    {profile?.displayName}
                  </LabelMedium>
                </Link>
                <a
                  href={`https://bsky.app/profile/${profile?.handle}`}
                  style={{
                    textDecoration: "none",
                    color: "#ff2876",
                  }}
                >
                  <LabelSmall
                    color={"#ff2876"}
                    marginTop={"3px"}
                    marginBottom={"25px"}
                  >
                    @{did}
                  </LabelSmall>
                </a>
              </div>
            </div>

            <NowPlaying did={did} />
          </Block>
        )}
        triggerType={TRIGGER_TYPE.hover}
        autoFocus={false}
        focusLock={false}
      >
        <Link to={link} style={{ textDecoration: "none" }}>
          <LabelMedium color={"#ff2876"}>@{did}</LabelMedium>
        </Link>
      </StatefulPopover>
    </>
  );
}

export default Handle;
