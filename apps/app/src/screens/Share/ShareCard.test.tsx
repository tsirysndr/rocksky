import { beforeEach, expect, mock, test } from "bun:test";
import * as React from "react";
import type { ShareItem, ShareKind } from "../../lib/shareLinks";

const listener = {
  avatar: "",
  did: "did:plc:listener",
  displayName: "Tsiry",
  handle: "tsiry-sandratraina.com",
};
let fetched: typeof listener | undefined = listener;
let viewer: typeof listener | null = listener;
let format: "story" | "square" = "story";
let state: unknown[] = [];
let stateIndex = 0;
let captures = 0;
mock.module("react", () => ({
  ...React,
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    const index = stateIndex++;
    if (!(index in state))
      state[index] = initial === "story" ? format : initial;
    return [
      state[index],
      (value: unknown) => {
        state[index] =
          typeof value === "function" ? value(state[index]) : value;
      },
    ];
  },
}));
mock.module("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: mock() },
  Image: "Image",
  Linking: { openURL: mock() },
  Platform: { OS: "android" },
  ScrollView: "ScrollView",
  Share: { share: mock() },
  StyleSheet: { create: (s: unknown) => s },
  TouchableOpacity: "TouchableOpacity",
  useWindowDimensions: () => ({ width: 400 }),
  View: "View",
}));
mock.module("@expo/vector-icons/Feather", () => ({ default: "Feather" }));
mock.module("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));
mock.module("expo-clipboard", () => ({ setStringAsync: async () => {} }));
mock.module("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: async () => {},
}));
mock.module("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
mock.module("react-native-view-shot", () => ({
  captureRef: async () => {
    captures++;
    return "file:///card.png";
  },
  releaseCapture: () => {},
}));
mock.module("../../../modules/rocksky-engine", () => ({
  sharePost: async () => true,
}));
mock.module("jotai", () => ({ useAtomValue: () => viewer }));
mock.module("../../atoms/profile", () => ({ profileAtom: {} }));
mock.module("../../components/Text", () => ({ Text: "Text" }));
mock.module("../../hooks/useProfile", () => ({
  useProfileByDidQuery: () => ({ data: fetched, isError: false }),
}));
mock.module("../../storage", () => ({
  storage: { getDid: () => listener.did },
}));

const { default: ShareCard } = await import("./ShareCard");
type Element = { props: Record<string, any> };
function elements(node: any): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !node.props) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props ? text(node.props.children) : "";
}
function render(item: ShareItem) {
  stateIndex = 0;
  return ShareCard({ route: { params: { item } }, navigation: {} } as never);
}
function shareButton(tree: any) {
  return elements(tree).find(
    (e) => typeof e.props.onPress === "function" && text(e) === "Share card",
  )!;
}
beforeEach(() => {
  state = [];
  stateIndex = 0;
  fetched = listener;
  viewer = listener;
  captures = 0;
});

for (const kind of [
  "scrobble",
  "track",
  "album",
  "artist",
  "profile",
  "wrapped",
  "chart",
] as ShareKind[]) {
  for (const size of ["story", "square"] as const) {
    test(`${kind} ${size} exports its display name and handle inside the captured card`, async () => {
      format = size;
      const personal = ["profile", "wrapped", "chart"].includes(kind);
      const item: ShareItem = {
        kind,
        uri: personal
          ? listener.did
          : `at://${listener.did}/app.rocksky.${kind === "track" ? "song" : kind}/abc`,
        title: "A song",
        subtitle: "An artist",
        year: 2025,
      };
      let tree = render(item);
      expect(shareButton(tree).props.disabled).toBe(true);
      for (const e of elements(tree)) e.props.onLayout?.();
      tree = render(item);
      const captured = elements(tree).find(
        (e) => e.props.collapsable === false,
      )!;
      expect(
        elements(captured).some(
          (e) =>
            e.props.testID === "share-card-avatar-placeholder" &&
            e.props.name === "user",
        ),
      ).toBe(true);
      expect(text(captured)).toContain("Tsiry");
      expect(text(captured)).toContain("@tsiry-sandratraina.com");
      expect(text(captured)).not.toContain("A little closer to the music.");
      expect(shareButton(tree).props.disabled).toBe(false);
      await shareButton(tree).props.onPress();
      expect(captures).toBe(1);
    });
  }
}
test("a scrobble stays unexportable until its owner's profile and layout are ready", () => {
  fetched = undefined;
  const item: ShareItem = {
    kind: "scrobble",
    uri: "at://did:plc:other/app.rocksky.scrobble/abc",
    title: "Song",
  };
  let tree = render(item);
  for (const e of elements(tree)) e.props.onLayout?.();
  tree = render(item);
  expect(shareButton(tree).props.disabled).toBe(true);
  expect(
    text(elements(tree).find((e) => e.props.collapsable === false)),
  ).not.toContain("Tsiry");
  fetched = {
    avatar: "",
    did: "did:plc:other",
    displayName: "Another listener",
    handle: "other.test",
  };
  tree = render(item);
  expect(shareButton(tree).props.disabled).toBe(true);
  for (const e of elements(tree)) e.props.onLayout?.();
  tree = render(item);
  expect(shareButton(tree).props.disabled).toBe(false);
  expect(
    text(elements(tree).find((e) => e.props.collapsable === false)),
  ).toContain("@other.test");
});

for (const kind of [
  "scrobble",
  "track",
  "album",
  "artist",
  "profile",
  "wrapped",
  "chart",
] as ShareKind[]) {
  for (const size of ["story", "square"] as const) {
    test(`${kind} ${size} captures the owner's circular avatar after it loads`, async () => {
      format = size;
      fetched = { ...listener, avatar: "https://images.test/avatar.jpg" };
      const item: ShareItem = {
        kind,
        uri: listener.did,
        owner: fetched,
        title: "Music",
        year: 2025,
      };
      if (!["profile", "wrapped", "chart"].includes(kind))
        item.uri = `at://${listener.did}/app.rocksky.${kind === "track" ? "song" : kind}/abc`;
      let tree = render(item);
      for (const e of elements(tree)) e.props.onLayout?.();
      tree = render(item);
      expect(shareButton(tree).props.disabled).toBe(true);
      const captured = elements(tree).find(
        (e) => e.props.collapsable === false,
      )!;
      const avatar = elements(captured).find(
        (e) => e.props.testID === "share-card-avatar",
      )!;
      expect(avatar.props.source.uri).toBe(fetched.avatar);
      expect(avatar.props.style.borderRadius * 2).toBe(
        avatar.props.style.width,
      );
      expect(
        elements(captured).some(
          (e) => e.props.testID === "share-card-avatar-placeholder",
        ),
      ).toBe(false);
      avatar.props.onLoad();
      tree = render(item);
      expect(shareButton(tree).props.disabled).toBe(false);
      await shareButton(tree).props.onPress();
      expect(captures).toBe(1);
    });
  }
}

test("failed avatar renders an outlined user placeholder before export and resets for a new URL", () => {
  fetched = { ...listener, avatar: "https://images.test/broken.jpg" };
  const item: ShareItem = {
    kind: "profile",
    uri: listener.did,
    title: "Profile",
  };
  let tree = render(item);
  for (const e of elements(tree)) e.props.onLayout?.();
  elements(tree)
    .find((e) => e.props.testID === "share-card-avatar")!
    .props.onError();
  tree = render(item);
  expect(shareButton(tree).props.disabled).toBe(true);
  expect(
    elements(tree).find(
      (e) => e.props.testID === "share-card-avatar-placeholder",
    )?.props.name,
  ).toBe("user");
  for (const e of elements(tree)) e.props.onLayout?.();
  expect(shareButton(render(item)).props.disabled).toBe(false);
  fetched = { ...listener, avatar: "https://images.test/new.jpg" };
  tree = render(item);
  expect(shareButton(tree).props.disabled).toBe(true);
  expect(
    elements(tree).find((e) => e.props.testID === "share-card-avatar")?.props
      .source.uri,
  ).toBe(fetched.avatar);
});
