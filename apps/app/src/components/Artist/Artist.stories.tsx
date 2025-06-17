import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import Artist from "./Artist";

const meta = {
  title: "Artist",
  component: Artist,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Artist>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    name: "Fifth Harmony",
    image: "https://i.scdn.co/image/ab6761610000e5eb5acb3cb0a8b87d3952738b97",
    did: "",
    onPress: () => {},
  },
};

export const Row: Story = {
  args: {
    name: "Fifth Harmony",
    image: "https://i.scdn.co/image/ab6761610000e5eb5acb3cb0a8b87d3952738b97",
    did: "",
    row: true,
    onPress: () => {},
  },
};
