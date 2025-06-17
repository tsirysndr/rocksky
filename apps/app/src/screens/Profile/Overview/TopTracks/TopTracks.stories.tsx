import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import TopTracks from "./TopTracks";

const meta = {
  title: "TopTracks",
  component: TopTracks,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof TopTracks>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    tracks: [
      {
        title: "Bad Dream",
        artist: "Cannons",
        image:
          "https://cdn.rocksky.app/covers/cc969b71214e8e8fb65fbfd5892dabcb.jpg",
        uri: "",
      },
      {
        title: "No Enemiesz",
        artist: "Kiesza",
        image:
          "https://cdn.rocksky.app/covers/e02bb04c7c33799e8bcf7fb4d3e07335.jpg",
        uri: "",
      },
      {
        title: "Hideaway",
        artist: "Kiesza",
        image:
          "https://cdn.rocksky.app/covers/e02bb04c7c33799e8bcf7fb4d3e07335.jpg",
        uri: "",
      },
      {
        title: "Sinner",
        artist: "Nu Aspect",
        image:
          "https://cdn.rocksky.app/covers/2152198cf875936537ecdf92faa77469.jpg",
        uri: "",
      },
      {
        title: "Flowers (feat. Jaykae and MALIKA)",
        artist: "Nathan Dawe",
        image:
          "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreigqdrg5pmv7ji7f72ricgqjyneno5j5qzeppsqmoy3yek3wqv3fca@jpeg",
        uri: "",
      },
      {
        title: "Sorry",
        artist: "Joel Corry",
        image:
          "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
        uri: "",
      },
      {
        title: "3 Libras",
        artist: "A Perfect Circle",
        image:
          "https://i.scdn.co/image/ab67616d0000b2732d73b494efcb99356f8c7b28",
        uri: "",
      },
    ],
    onSeeAll: () => {},
    onPressTrack: () => {},
    onPressAlbum: () => {},
  },
};
