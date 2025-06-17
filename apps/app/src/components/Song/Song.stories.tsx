import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import Song from "./Song";

const meta = {
  title: "Song",
  component: Song,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Song>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    image:
      "https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg",
    title: "Work from Home (feat. Ty Dolla $ign)",
    artist: "Fith Harmony",
    did: "",
    onPress: () => {},
    onOpenBlueskyProfile: () => {},
    onPressAlbum: () => {},
  },
};

export const Scrobble: Story = {
  args: {
    image:
      "https://cdn.rocksky.app/covers/cbed73745681d6a170b694ee11bb527c.jpg",
    title: "Work from Home (feat. Ty Dolla $ign)",
    artist: "Fith Harmony",
    listenerHandle: "@tsiry-sandratraina.com",
    did: "",
    onPress: () => {},
    onOpenBlueskyProfile: () => {},
    onPressAlbum: () => {},
  },
};
