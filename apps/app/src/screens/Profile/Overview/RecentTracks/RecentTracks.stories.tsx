import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import RecentTracks from "./RecentTracks";

const meta = {
  title: "RecentTracks",
  component: RecentTracks,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof RecentTracks>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    tracks: [
      {
        id: "1",
        title: "Work from Home (feat. Ty Dolla $ign)",
        artist: "Fith Harmony",
        image:
          "https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg",
        albumUri: "",
        listeningDate: "2023-10-01T12:00:00Z",
        uri: "",
      },
      {
        id: "2",
        title: "BED",
        artist: "Joel Corry",
        image:
          "https://i.scdn.co/image/ab67616d0000b273b06c09b9f72389ee7f1cbd6b",
        albumUri: "",
        listeningDate: "2023-10-01T12:00:00Z",
        uri: "",
      },
      {
        id: "3",
        title: "Friday (feat. Mufasa & Hypeman) - Dopamine Re-Edit",
        artist: "Riton",
        image:
          "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreihvqfivhiaxj4cxkwfptzdxwnrwkqsasuirxi5ub3mgyxzgi4yc7i@jpeg",
        albumUri: "",
        listeningDate: "2023-10-01T12:00:00Z",
        uri: "",
      },
      {
        id: "4",
        title: "Hear Me Say",
        artist: "Jonas Blue",
        image:
          "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreigjwz3opdzwdeispeckym2gpiy4kixp4skz2gdelckujkbnkz3edm@jpeg",
        albumUri: "",
        listeningDate: "2023-10-01T12:00:00Z",
        uri: "",
      },
      {
        id: "5",
        title: "Flowers (feat. Jaykae and MALIKA)",
        artist: "Nathan Dawe",
        image:
          "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreigqdrg5pmv7ji7f72ricgqjyneno5j5qzeppsqmoy3yek3wqv3fca@jpeg",
        albumUri: "",
        listeningDate: "2023-10-01T12:00:00Z",
        uri: "",
      },
      {
        id: "6",
        title: "Sorry",
        artist: "Joel Corry",
        image:
          "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
        albumUri: "",
        listeningDate: "2023-10-01T12:00:00Z",
        uri: "",
      },
      {
        id: "7",
        title: "3 Libras",
        artist: "A Perfect Circle",
        image:
          "https://i.scdn.co/image/ab67616d0000b2732d73b494efcb99356f8c7b28",
        albumUri: "",
        listeningDate: "2023-10-01T12:00:00Z",
        uri: "",
      },
    ],
    onSeeAll: () => {},
    onPressTrack: () => {},
    onPressAlbum: () => {},
  },
};
