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
        title: "Work from Home (feat. Ty Dolla $ign)",
        artist: "Fith Harmony",
        image:
          "https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg",
      },
      {
        title: "BED",
        artist: "Joel Corry",
        image:
          "https://i.scdn.co/image/ab67616d0000b273b06c09b9f72389ee7f1cbd6b",
      },
      {
        title: "Friday (feat. Mufasa & Hypeman) - Dopamine Re-Edit",
        artist: "Riton",
        image:
          "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreihvqfivhiaxj4cxkwfptzdxwnrwkqsasuirxi5ub3mgyxzgi4yc7i@jpeg",
      },
      {
        title: "Hear Me Say",
        artist: "Jonas Blue",
        image:
          "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreigjwz3opdzwdeispeckym2gpiy4kixp4skz2gdelckujkbnkz3edm@jpeg",
      },
      {
        title: "Flowers (feat. Jaykae and MALIKA)",
        artist: "Nathan Dawe",
        image:
          "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreigqdrg5pmv7ji7f72ricgqjyneno5j5qzeppsqmoy3yek3wqv3fca@jpeg",
      },
      {
        title: "Sorry",
        artist: "Joel Corry",
        image:
          "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
      },
      {
        title: "3 Libras",
        artist: "A Perfect Circle",
        image:
          "https://i.scdn.co/image/ab67616d0000b2732d73b494efcb99356f8c7b28",
      },
    ],
    onSeeAll: () => {},
    onPressTrack: () => {},
    onPressAlbum: () => {},
  },
};
