import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import Stats from "./Stats";

const meta = {
  title: "Stats",
  component: Stats,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Stats>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    scrobbles: 10465,
    artists: 716,
    lovedTracks: 1024,
  },
};
