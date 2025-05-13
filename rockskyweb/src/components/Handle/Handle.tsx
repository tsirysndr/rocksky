import { Avatar } from "baseui/avatar";
import { Block } from "baseui/block";
import { StatefulPopover, TRIGGER_TYPE } from "baseui/popover";
import { LabelMedium, LabelSmall } from "baseui/typography";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { Link } from "react-router";
import { profilesAtom } from "../../atoms/profiles";
import { statsAtom } from "../../atoms/stats";
import {
  useProfileByDidQuery,
  useProfileStatsByDidQuery,
} from "../../hooks/useProfile";
import Stats from "../Stats";
import NowPlaying from "./NowPlaying";

export type HandleProps = {
  link: string;
  did: string;
};

function Handle(props: HandleProps) {
  const { link, did } = props;
  const [profiles, setProfiles] = useAtom(profilesAtom);
  const profile = useProfileByDidQuery(did);
  const profileStats = useProfileStatsByDidQuery(did);
  const [stats, setStats] = useAtom(statsAtom);

  useEffect(() => {
    if (profile.isLoading || profile.isError) {
      return;
    }

    if (!profile.data || !did) {
      return;
    }

    setProfiles((profiles) => ({
      ...profiles,
      [did]: {
        avatar: profile.data.avatar,
        displayName: profile.data.display_name,
        handle: profile.data.handle,
        spotifyConnected: profile.data.spotifyConnected,
        createdAt: profile.data.xata_createdat,
        did,
      },
    }));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, profile.isLoading, profile.isError, did]);

  useEffect(() => {
    if (profileStats.isLoading || profileStats.isError) {
      return;
    }

    if (!profileStats.data || !did) {
      return;
    }

    setStats((prev) => ({
      ...prev,
      [did]: {
        scrobbles: profileStats.data.scrobbles,
        artists: profileStats.data.artists,
        lovedTracks: profileStats.data.lovedTracks,
        albums: profileStats.data.albums,
        tracks: profileStats.data.tracks,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileStats.data, profileStats.isLoading, profileStats.isError, did]);

  return (
    <>
      <StatefulPopover
        content={() => (
          <Block
            padding={"15px"}
            backgroundColor={"#fff"}
            style={{
              borderRadius: "12px",
              width: "380px",
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
                  src={profiles[did]?.avatar}
                  name={profiles[did]?.displayName}
                  size={"60px"}
                />
              </Link>
              <div style={{ marginLeft: "16px" }}>
                <Link to={link} style={{ textDecoration: "none" }}>
                  <LabelMedium marginTop={"10px"}>
                    {profiles[did]?.displayName}
                  </LabelMedium>
                </Link>
                <a
                  href={`https://bsky.app/profile/${profiles[did]?.handle}`}
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

            {stats[did] && <Stats stats={stats[did]} mb={1} />}

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
