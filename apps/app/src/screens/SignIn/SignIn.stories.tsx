import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import SignIn from "./SignIn";

const meta = {
  title: "SignIn",
  component: SignIn,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof SignIn>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
};
