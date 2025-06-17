import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import Album from "./Album";

const meta = {
  title: "Album",
  component: Album,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Album>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    image:
      "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
    title: "Another Friday Night",
    artist: "Joel Corry",
    did: "",
    onPress: () => {},
  },
};

export const Row: Story = {
  args: {
    image:
      "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
    title: "Another Friday Night",
    artist: "Joel Corry",
    row: true,
    size: 80,
    did: "",
    onPress: () => {},
  },
};
