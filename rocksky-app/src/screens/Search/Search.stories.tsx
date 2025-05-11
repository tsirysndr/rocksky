import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import Search from "./Search";

const meta = {
  title: "Search",
  component: Search,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Search>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
};
