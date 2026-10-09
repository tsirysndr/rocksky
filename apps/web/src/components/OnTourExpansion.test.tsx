import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import OnTour from "./OnTour";

const state = vi.hoisted(() => ({
  expandedArtist: undefined as string | undefined,
  effects: [] as (() => void)[],
  stateIndex: 0,
  query: {} as Record<string, unknown>,
  fetchNextPage: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) =>
    state.stateIndex++ === 0
      ? [
          state.expandedArtist,
          (artist?: string) => {
            state.expandedArtist = artist;
          },
        ]
      : [initial, vi.fn()],
  useEffect: (effect: () => void) => {
    state.effects.push(effect);
  },
  useRef: () => ({ current: null }),
  useId: () => "concerts",
}));
vi.mock("../hooks/useArtistEvents", () => ({
  useArtistEvents: () => state.query,
}));
vi.mock("./EventRsvpButton", () => ({ default: () => null }));

const event = { uri: "show", name: "Concert", locations: [], uris: [] };
function render() {
  state.stateIndex = 0;
  state.effects = [];
  const element = OnTour({ artistUri: "artist" })!;
  for (const effect of state.effects) effect();
  const children = element.props.children as ReactElement[];
  return {
    toggle: children[2] as ReactElement<{
      onClick: () => void;
      "aria-expanded": boolean;
    }>,
    count: children[1].props.children.length as number,
  };
}
beforeEach(() => {
  state.expandedArtist = undefined;
  state.fetchNextPage.mockReset();
  state.query = {
    data: {
      pages: [
        Array.from({ length: 20 }, (_, i) => ({ ...event, uri: `show-${i}` })),
      ],
    },
    hasNextPage: true,
    isFetching: false,
    isFetchNextPageError: false,
    fetchNextPage: state.fetchNextPage,
  };
});

it("expands the preview and automatically continues pagination until all concerts are loaded", () => {
  const preview = render();
  expect(preview.count).toBe(6);
  expect(state.fetchNextPage).not.toHaveBeenCalled();
  preview.toggle.props.onClick();
  expect(render().count).toBe(20);
  expect(state.fetchNextPage).toHaveBeenCalledTimes(1);
  state.query.isFetching = true;
  render();
  expect(state.fetchNextPage).toHaveBeenCalledTimes(1);
  state.query.isFetching = false;
  render();
  expect(state.fetchNextPage).toHaveBeenCalledTimes(2);
  state.query.hasNextPage = false;
  render();
  expect(state.fetchNextPage).toHaveBeenCalledTimes(2);
});

it("collapses while loading and stops requesting further pages", () => {
  render().toggle.props.onClick();
  const expanded = render();
  state.query.isFetching = true;
  expanded.toggle.props.onClick();
  state.query.isFetching = false;
  expect(render().count).toBe(6);
  expect(state.fetchNextPage).toHaveBeenCalledTimes(1);
});

it("does not loop on pagination failures and keeps loaded concerts visible", () => {
  render().toggle.props.onClick();
  state.query.isFetchNextPageError = true;
  expect(render().count).toBe(20);
  expect(state.fetchNextPage).not.toHaveBeenCalled();
});
