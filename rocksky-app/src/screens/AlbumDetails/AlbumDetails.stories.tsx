import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import AlbumDetails from "./AlbumDetails";

const meta = {
  title: "AlbumDetails",
  component: AlbumDetails,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof AlbumDetails>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
};
