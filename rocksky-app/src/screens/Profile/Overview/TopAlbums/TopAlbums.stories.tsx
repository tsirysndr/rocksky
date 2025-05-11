import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import TopAlbums from "./TopAlbums";

const meta = {
  title: "TopAlbums",
  component: TopAlbums,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof TopAlbums>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    albums: [
      {
        artist: "Joel Corry",
        title: "Another Friday Night",
        image:
          "https://cdn.rocksky.app/covers/ec9bbc208b04182f315f8137cfb2125b.jpg",
      },
      {
        artist: "Jazzy",
        title: "Constellations (Expanded)",
        image:
          "https://cdn.rocksky.app/covers/e27039e89dbccf04a6a698cd0b6e160b.jpg",
      },
      {
        artist: "The Weeknd",
        title: "Hurry Up Tomorrow",
        image:
          "https://cdn.rocksky.app/covers/a4f0a009ce6ecf71949612674aed84dd.jpg",
      },
      {
        artist: "Linkin Park",
        title: "Meteora 20th Anniversary Edition",
        image:
          "https://cdn.rocksky.app/covers/da9e82337eb069388e05b93f89c9c41c.jpg",
      },
    ],
    onSeeAll: () => {},
    onPressAlbum: () => {},
  },
};
