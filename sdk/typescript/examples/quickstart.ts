import { createClient } from "../src";

const client = createClient();

const profile = await client.actor.getProfile<{ handle: string; did: string }>({
  did: "did:plc:7vdlgi2bflelz7mmuxoqjfcr",
});

console.log("handle:", profile.handle, "did:", profile.did);

const topTracks = await client.charts.getTopTracks({ limit: 5 });
console.log("top tracks:", topTracks);
