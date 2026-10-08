// Real catalog metadata. Artwork sources are documented in README.md.
import type { Track, ReceiverState } from "./receiver";
export const tracks: Track[] = [
  {
    id: "617154366",
    title: "Get Lucky",
    artist: "Daft Punk, Pharrell Williams & Nile Rodgers",
    album: "Random Access Memories",
    artwork: "/artwork/0.jpg",
    duration: 370,
    source: "uploaded",
  },
  {
    id: "1440838060",
    title: "Let It Happen",
    artist: "Tame Impala",
    album: "Currents",
    artwork: "/artwork/1.jpg",
    duration: 467,
    source: "local",
  },
  {
    id: "1603171870",
    title: "Out of Time",
    artist: "The Weeknd",
    album: "Dawn FM",
    artwork: "/artwork/2.jpg",
    duration: 214,
    source: "uploaded",
  },
  {
    id: "850569480",
    title: "On Melancholy Hill",
    artist: "Gorillaz",
    album: "Plastic Beach",
    artwork: "/artwork/3.jpg",
    duration: 234,
    source: "local",
  },
];
export const demoState: ReceiverState = {
  phase: "playing",
  track: tracks[0],
  position: 126,
  duration: tracks[0].duration,
  queue: tracks.slice(1),
  queuePosition: 1,
  queueTotal: tracks.length,
  volume: 0.65,
};
