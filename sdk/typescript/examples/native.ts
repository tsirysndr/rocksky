// Read-only tour of the Rocksky SDK (no auth needed).
//   bun run examples/native.ts
import { RockskyClient, songHash } from "../src/index.js";

const rk = new RockskyClient(); // pass a base URL to override https://api.rocksky.app
const stats = await rk.globalStats();
console.log(`global: ${stats.scrobbles} scrobbles · ${stats.users} users · ${stats.tracks} tracks`);

console.log("top tracks:");
for (const t of await rk.topTracks(5, 0)) console.log(`  ${t.artist} — ${t.title}`);

console.log("song hash:", songHash("Chaser", "Calibro 35", "Jazzploitation"));

// --- write side (uncomment with real credentials) ---
// import { Agent, RockskyIndex } from "../src/index.js";
// const agent = await Agent.login("alice.bsky.social", "app-password");
// const idx = new RockskyIndex("./dedup"); await idx.open(); agent.useIndex(idx);
// await agent.syncRepo();                       // backfill the dedup index
// const uri = await agent.scrobble({ title: "Chaser", artist: "Calibro 35",
//   album: "Jazzploitation", albumArtist: "Calibro 35", duration: 182320 });
// console.log("scrobbled:", uri);
// agent.hydrateFromJetstream();                 // keep the index live (background)

// --- library: your uploaded music (needs an access token) ---
// const lib = new RockskyClient(undefined, process.env.ROCKSKY_TOKEN).library();
// console.log(await lib.getGenres());
// console.log(await lib.getAlbumList("newest", { size: 10 }));
// console.log(await lib.getSong("<song-id>"));
