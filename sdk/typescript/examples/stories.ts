import { createClient } from "../src";

const client = createClient();

const recent = await client.feed.getStories({ size: 10 });
console.log("recent stories:", recent);

const metalcore = await client.feed.getStories({
  size: 10,
  feed: "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore",
});
console.log("stories in metalcore feed:", metalcore);

const authed = createClient({ auth: process.env.ROCKSKY_TOKEN });
const fromFollowing = await authed.feed.getStories({
  size: 10,
  following: true,
});
console.log("stories from people I follow:", fromFollowing);
