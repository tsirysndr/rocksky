import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import TopArtists from "./TopArtists";

const meta = {
  title: "TopArtists",
  component: TopArtists,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof TopArtists>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    artists: [
      {
        rank: 1,
        name: "J. Cole",
        image:
          "https://i.scdn.co/image/ab6761610000e5eb4b053c29fd4b317ff825f0dc",
        uri: "",
      },
      {
        rank: 2,
        name: "Joel Corry",
        image:
          "https://i.scdn.co/image/ab6761610000e5eb148be0a90a1600cc71126e5b",
        uri: "",
      },
      {
        rank: 3,
        name: "Linkin Park",
        image:
          "https://i.scdn.co/image/ab6761610000e5ebc7e6bd9e65eab62a53355576",
        uri: "",
      },
      {
        rank: 4,
        name: "Kiesza",
        image:
          "https://i.scdn.co/image/ab6761610000e5ebf8449085dadabebe939997a1",
        uri: "",
      },
      {
        rank: 5,
        name: "Daft Punk",
        image:
          "https://i.scdn.co/image/ab6761610000e5eba7bfd7835b5c1eee0c95fa6e",
        uri: "",
      },
      {
        rank: 6,
        name: "Patoranking",
        image:
          "https://i.scdn.co/image/ab6761610000e5eb3f4fb85ebdf70160f64caa10",
        uri: "",
      },
    ],
    onSeeAll: () => {},
    onPressArtist: () => {},
  },
};
