import { createClient } from "../src";

const client = createClient();

type ScrobblesResponse = {
  scrobbles: Array<{ uri: string; track: { title: string; artist: string } }>;
};

async function* paginate(did: string, pageSize = 50) {
  let offset = 0;
  while (true) {
    const page = await client.actor.getActorScrobbles<ScrobblesResponse>({
      did,
      limit: pageSize,
      offset,
    });
    const items = page.scrobbles ?? [];
    if (items.length === 0) return;
    for (const item of items) yield item;
    if (items.length < pageSize) return;
    offset += pageSize;
  }
}

let n = 0;
for await (const s of paginate("tsiry.bsky.social", 25)) {
  n++;
  if (n > 100) break;
  console.log(s.track.title, "—", s.track.artist);
}
