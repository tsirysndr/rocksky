import { createClient, paginate } from "../src";

const client = createClient();

// Offset/limit pattern — most rocksky endpoints work this way.
type Scrobble = { uri: string; track: { title: string; artist: string } };
type ScrobblesResponse = { scrobbles: Scrobble[] };

const iter = paginate<Scrobble>({
  fetch: async ({ limit, offset }) => {
    const page = await client.actor.getActorScrobbles<ScrobblesResponse>({
      did: "tsiry.bsky.social",
      limit,
      offset,
    });
    return page.scrobbles ?? [];
  },
  pageSize: 50,
  maxItems: 200,
});

for await (const s of iter) {
  console.log(s.track.title, "—", s.track.artist);
}

// Cursor pattern — getFollowers/getFollows.
type Follower = { did: string; handle: string };
type FollowersResponse = { followers: Follower[]; cursor?: string };

const followers = await client
  .paginate<Follower>({
    fetch: async ({ limit, cursor }) => {
      const page = await client.graph.getFollowers<FollowersResponse>({
        actor: "tsiry.bsky.social",
        limit,
        cursor,
      });
      return { items: page.followers, cursor: page.cursor };
    },
    pageSize: 100,
  })
  .toArray();

console.log("total followers:", followers.length);
