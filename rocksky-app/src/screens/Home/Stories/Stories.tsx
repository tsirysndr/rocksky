import { RootStackParamList } from "@/src/Navigation";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { ScrollView } from "react-native";
import Avatar from "./Avatar";

const stories = [
  {
    handle: "@vicwalker.bsky.social",
    image:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:fip3nyk6tjo3senpq4ei2cxw/bafkreifiizb2nbmuffl5gcqw66vbbk7v6xioi6tpzh3bx5f24fisv4rka4@jpeg",
  },
  {
    handle: "@max.woke.cat",
    image:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:5amoelshbjx4rmg4g5jpepl7/bafkreie2zhw4kpa4pnk6jukli7phbm5n5tprt5fqrexjgmnxm2wzc3qiny@jpeg",
  },
  {
    handle: "@kirisaki-vk.bsky.social",
    image:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:vcutsppo74oyb5jsd6pewrgf/bafkreicsurnfdarvotfpkbbgjxetxbqkprvltww3asxjl244ewvvvfcoae@jpeg",
  },
  {
    handle: "@tsiry-sandratraina.com",
    image:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreihkoydiswk2jc46z5ip7l45s66ligct5swneanhnrsnn66y3oxlpm@jpeg",
  },
  {
    handle: "@oppi.li",
    image:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:qfpnj4og54vl56wngdriaxug/bafkreihcpwv6ezsmj4jwe237d65k3krsdtokcp4etwu7r7vtkzjnunhh6e@jpeg",
  },
  {
    handle: "@fitiavana07.bsky.social",
    image:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:d5jvs7uo4z6lw63zzreukgt4/bafkreifcgsam3qlqrwxrxe6t7aq6jj4ok7kqijg25r33j26k3cjawu32fm@jpeg",
  },
  {
    handle: "@flaky.blue",
    image:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:6x3sa4qcuhtc4yky2f6eu2ki/bafkreibu2l2mab74we6sotx3sm4xawxgbmendixfvdunadidgspjer2yoq@jpeg",
  },
];

const Stories = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {stories.map((story, index) => (
          <Avatar
            key={index}
            name={story.handle}
            image={story.image}
            size={72}
            className="mr-[10px]"
            onPress={() => {
              navigation.navigate("Story", {
                avatar: story.image,
                handle: story.handle,
                title: "unravel (acoustic version)",
                artist: "TK from Ling tosite sigure",
                albumArt:
                  "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:fip3nyk6tjo3senpq4ei2cxw/bafkreibgrplda7ysj6znh356kiu5m2nmip7dcunywxrnl6rv7aoioohsja@jpeg",
                albumUri: "",
                artistUri: "",
                trackUri: "",
              });
            }}
          />
        ))}
      </ScrollView>
    </>
  );
};

export default Stories;
