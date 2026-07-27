import { atom } from "jotai";

// "rockbox" = the in-browser wasm engine (local playback).
// "spotify"  = the connected Spotify account (polled).
// "device"   = a remote controllable device on the /ws relay (the Rocksky CLI,
//              or the Rockbox companion daemon) — now-playing arrives over the
//              socket and transport is sent back as commands.
export const playerAtom = atom<"rockbox" | "spotify" | "device" | null>(null);
