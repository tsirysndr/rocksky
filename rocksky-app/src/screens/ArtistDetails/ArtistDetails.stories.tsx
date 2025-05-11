import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import ArtistDetails from "./ArtistDetails";

const meta = {
  title: "ArtistDetails",
  component: ArtistDetails,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ArtistDetails>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
};
