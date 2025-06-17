import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import Home from "./Home";

const meta = {
  title: "Home",
  component: Home,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Home>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
};
