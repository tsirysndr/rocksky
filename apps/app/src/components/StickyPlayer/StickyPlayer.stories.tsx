import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import StickyPlayer from "./StickyPlayer";

const meta = {
  title: "StickyPlayer",
  component: StickyPlayer,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof StickyPlayer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    liked: false,
    isPlaying: true,
    onPlay: () => {},
    onPause: () => {},
    progress: 50,
    song: {
      title: "Tyler Herro",
      artist: "Jack Harlow",
      cover: "https://i.scdn.co/image/ab67616d0000b273aeb14ead136118a987246b63",
      uri: "",
    },
    onDislike: () => {},
    onLike: () => {},
  },
};
