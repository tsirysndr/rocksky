import { didAtom } from "@/src/atoms/did";
import { handleAtom } from "@/src/atoms/handle";
import { useProfileByDidQuery } from "@/src/hooks/useProfile";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { Linking } from "react-native";
import Avatar from "./Avatar";

const AvatarWithData = () => {
  const handle = useAtomValue(handleAtom);
  const setDid = useSetAtom(didAtom);

  const { data, isLoading } = useProfileByDidQuery(
    handle || "did:plc:7vdlgi2bflelz7mmuxoqjfcr",
  );

  useEffect(() => {
    if (data) {
      setDid(data.did);
    }
  }, [data]);

  return (
    <>
      {!isLoading && data && (
        <Avatar
          avatar={data.avatar}
          name={data.display_name}
          handle={`@${data.handle}`}
          scrobblingSince={dayjs(data.xata_createdat).format("DD MMM YYYY")}
          did={data.did}
          onOpenBlueskyProfile={(handle: string) => {
            Linking.openURL(
              `https://bsky.app/profile/${handle.replace("@", "")}`,
            );
          }}
          onViewOnPdsls={(did: string) => {
            Linking.openURL(`https://pdsls.dev/at/${did}`);
          }}
        />
      )}
    </>
  );
};

export default AvatarWithData;
