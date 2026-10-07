import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { NowPlaying, type NowPlayingProps } from "./NowPlaying";
import { demoState, tracks } from "./fixtures";

const meta = {
  title: "TV/Now playing",
  component: NowPlaying,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Rocksky's Chromecast receiver. Real tracks and local artwork, using the same Rockford Sans fonts as the Android app. Pause/play and the timeline work in every story; no Chromecast or account is needed.",
      },
    },
  },
  args: { state: demoState },
  render: function Interactive(args: NowPlayingProps) {
    const [state, setState] = useState(args.state);
    useEffect(() => setState(args.state), [args.state]);
    return (
      <NowPlaying
        state={state}
        onToggle={() =>
          setState((value) => ({
            ...value,
            phase: value.phase === "playing" ? "paused" : "playing",
          }))
        }
        onSeek={(position) => setState((value) => ({ ...value, position }))}
      />
    );
  },
} satisfies Meta<typeof NowPlaying>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UploadedMusic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Get Lucky" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Pause" }));
    await expect(canvas.getByText("ON PAUSE")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Play" }));
    await expect(canvas.getByText("NOW PLAYING")).toBeVisible();
  },
};
export const LocalMusic: Story = {
  args: {
    state: {
      ...demoState,
      track: tracks[1],
      duration: tracks[1].duration,
      queue: [tracks[2], tracks[3], tracks[0]],
    },
  },
};
export const Paused: Story = {
  args: { state: { ...demoState, phase: "paused" } },
};
export const Buffering: Story = {
  args: { state: { ...demoState, phase: "loading", position: 0 } },
};
export const ReadyToCast: Story = {
  args: { state: { ...demoState, phase: "idle", track: null, queue: [] } },
};
export const NoArtwork: Story = {
  args: {
    state: {
      ...demoState,
      track: { ...tracks[3], artwork: "" },
      duration: tracks[3].duration,
    },
  },
};
export const BrokenArtwork: Story = {
  args: {
    state: {
      ...demoState,
      track: { ...tracks[0], artwork: "/artwork/missing.jpg" },
    },
  },
};
export const LongMetadata: Story = {
  args: {
    state: {
      ...demoState,
      track: {
        ...tracks[0],
        title:
          "Get Lucky (feat. Pharrell Williams & Nile Rodgers) [Daft Punk Remix]",
        artist:
          "Daft Punk, Pharrell Williams, Nile Rodgers & the Random Access Memories collaborators",
        album: "Random Access Memories (10th Anniversary Expanded Edition)",
      },
    },
  },
};
export const EmptyQueue: Story = {
  args: { state: { ...demoState, queue: [] } },
};
export const PlaybackError: Story = {
  args: {
    state: {
      ...demoState,
      phase: "error",
      error:
        "Your phone is no longer on the same Wi-Fi network. Reconnect and try again.",
    },
  },
};
export const ReceiverOffline: Story = {
  args: {
    state: {
      ...demoState,
      phase: "error",
      track: null,
      error: "Open Rocksky on your phone and connect to this Chromecast.",
    },
  },
};
export const NearEnd: Story = {
  args: { state: { ...demoState, position: demoState.duration - 2 } },
};
export const HD720: Story = {
  parameters: { viewport: { defaultViewport: "hd" } },
};
