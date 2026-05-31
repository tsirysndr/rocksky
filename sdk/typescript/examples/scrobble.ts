import { RockskyClient } from "../src";

const client = RockskyClient.builder()
  .bearer(process.env.ROCKSKY_TOKEN ?? "")
  .build();

// Scrobble a track you just finished playing.
await client.scrobble.createScrobble({
  title: "Heart of Glass",
  artist: "Blondie",
  album: "Parallel Lines",
  duration: 232_000,
  releaseDate: "1978-09-23",
  spotifyLink: "https://open.spotify.com/track/4kflIGfjdZJW4ot2ioixTB",
  timestamp: Math.floor(Date.now() / 1000),
});

// Like the song after scrobbling.
await client.like.likeSong({
  uri: "at://did:plc:xxx/app.rocksky.song/abc",
});

console.log("scrobbled + liked");
