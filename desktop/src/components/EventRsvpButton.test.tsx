import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistEvent } from "../types/event";
import EventRsvpButton from "./EventRsvpButton";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  signIn: vi.fn(),
  error: vi.fn(),
  stateIndex: 0,
  token: null as string | null,
  pending: false,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    false,
    mocks.stateIndex++ === 0 ? mocks.signIn : mocks.error,
  ],
}));
vi.mock("../hooks/useEventRsvp", () => ({
  useEventRsvp: () => ({ mutate: mocks.mutate, isPending: mocks.pending }),
}));
vi.mock("../api/events", () => ({
  rsvpRequiresSignIn: (error: { status: number }) =>
    error.status === 401 || error.status === 403,
}));
vi.mock("./SignInModal", () => ({ default: () => null }));

const event: ArtistEvent = {
  uri: "at://event",
  name: "Concert",
  locations: [],
  uris: [],
};
function controls(viewerRsvp?: ArtistEvent["viewerRsvp"]) {
  const result = EventRsvpButton({ event: { ...event, viewerRsvp } });
  return result.props.children[0] as ReactElement<{
    onClick: () => void;
    "aria-pressed": boolean;
    disabled: boolean;
  }>[];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stateIndex = 0;
  mocks.token = null;
  mocks.pending = false;
  vi.stubGlobal("localStorage", { getItem: () => mocks.token });
});

describe("event RSVP actions", () => {
  it("opens sign-in for either choice without sending an anonymous write", () => {
    for (const button of controls()) button.props.onClick();
    expect(mocks.signIn).toHaveBeenCalledWith(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("saves Going or Interested for authenticated users", () => {
    mocks.token = "signed-in";
    const buttons = controls();
    buttons[0].props.onClick();
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      "community.lexicon.calendar.rsvp#going",
      expect.any(Object),
    );
    buttons[1].props.onClick();
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      "community.lexicon.calendar.rsvp#interested",
      expect.any(Object),
    );
  });
  it("marks the current RSVP and clears it when pressed again", () => {
    mocks.token = "signed-in";
    const buttons = controls("community.lexicon.calendar.rsvp#going");
    expect(buttons[0].props["aria-pressed"]).toBe(true);
    buttons[0].props.onClick();
    expect(mocks.mutate).toHaveBeenCalledWith(
      "community.lexicon.calendar.rsvp#notgoing",
      expect.any(Object),
    );
  });
  it("opens sign-in again for expired sessions or missing RSVP permission", () => {
    mocks.token = "old-session";
    controls()[0].props.onClick();
    mocks.mutate.mock.calls[0][1].onError({ status: 403 });
    expect(mocks.signIn).toHaveBeenCalledWith(true);
  });
  it("reports failed writes and disables both controls while saving", () => {
    mocks.token = "signed-in";
    mocks.pending = true;
    const buttons = controls();
    expect(buttons.every((button) => button.props.disabled)).toBe(true);
    buttons[0].props.onClick();
    mocks.mutate.mock.calls[0][1].onError({ status: 500 });
    expect(mocks.error).toHaveBeenCalledWith(true);
  });
});
