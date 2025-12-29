import { atom } from "jotai";

export const feedAtom = atom<string>("all");

export const feedGeneratorUriAtom = atom<string>(
  "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/all",
);
