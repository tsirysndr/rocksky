import { Linking } from "react-native";
import Avatar from "./Avatar";

const AvatarWithData = () => {
  return (
    <Avatar
      avatar="https://cdn.bsky.app/img/avatar/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreihkoydiswk2jc46z5ip7l45s66ligct5swneanhnrsnn66y3oxlpm@jpeg"
      name="Tsiry Sandratraina 🦀"
      handle="@tsiry-sandratraina.com"
      scrobblingSince="03 Feb 2025"
      did="did:plc:7vdlgi2bflelz7mmuxoqjfcr"
      onOpenBlueskyProfile={(handle: string) => {
        Linking.openURL(`https://bsky.app/profile/${handle.replace("@", "")}`);
      }}
      onViewOnPdsls={(did: string) => {
        Linking.openURL(`https://pdsls.dev/at/${did}`);
      }}
    />
  );
};

export default AvatarWithData;
