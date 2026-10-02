import { atom } from "jotai";

// Resolved from app.rocksky.feed.getFeedGenerators at runtime; empty until then.
export const feedGeneratorUriAtom = atom<string>("");
export const followingFeedAtom = atom<boolean>(false);
export const feedAtom = atom<string>("all");
export const feedUrisAtom = atom<Record<string, string>>({});
