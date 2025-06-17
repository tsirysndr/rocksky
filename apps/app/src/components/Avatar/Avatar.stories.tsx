import type { Meta, StoryObj } from "@storybook/react";
import { View } from "react-native";
import Avatar from "./Avatar";

const meta = {
  title: "Avatar",
  component: Avatar,
  argTypes: {},
  args: {},
  decorators: [
    (Story) => (
      <View style={{ padding: 16, alignItems: "flex-start" }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    avatar:
      "https://cdn.bsky.app/img/avatar/plain/did:plc:7vdlgi2bflelz7mmuxoqjfcr/bafkreihkoydiswk2jc46z5ip7l45s66ligct5swneanhnrsnn66y3oxlpm@jpeg",
    name: "Tsiry Sandratraina 🦀",
    handle: "@tsiry-sandratraina.com",
    scrobblingSince: "03 Feb 2025",
    did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr",
    onOpenBlueskyProfile: () => {},
    onViewOnPdsls: () => {},
  },
};
