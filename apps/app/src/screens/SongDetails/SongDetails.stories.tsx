import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import SongDetails from "./SongDetails";

const meta = {
  title: "SongDetails",
  component: SongDetails,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof SongDetails>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
};
