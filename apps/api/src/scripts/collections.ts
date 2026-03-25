import { AtpAgent } from "@atproto/api";
import { Record } from "@atproto/api/dist/client/types/com/atproto/repo/listRecords";
import { consola } from "consola";
import { ctx } from "context";
import extractPdsFromDid from "lib/extractPdsFromDid";
import { chalk } from "zx/core";

const args = process.argv.slice(2);

if (args.length === 0) {
  consola.error("Please provide user identifier (handle or DID).");
  console.log(`Usage: ${chalk.cyan("npm run collections -- <handle|did>")}`);
  process.exit(1);
}

let did: string = args[0];

if (!did.startsWith("did:")) {
  did = await ctx.baseIdResolver.handle.resolve(did);
}

async function getAtpAgent(did: string): Promise<AtpAgent> {
  const serviceEndpoint = await extractPdsFromDid(did);

  consola.info(`Using service endpoint: ${chalk.cyan(serviceEndpoint)}`);

  return new AtpAgent({ service: serviceEndpoint });
}

async function getScrobbleRecords(agent: AtpAgent, did: string) {
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: "app.rocksky.scrobble",
    limit: 100,
  });

  return res.data.records;
}

async function getSongRecords(agent: AtpAgent, did: string) {
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: "app.rocksky.song",
    limit: 100,
  });

  return res.data.records;
}

async function getArtistRecords(agent: AtpAgent, did: string) {
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: "app.rocksky.artist",
    limit: 100,
  });

  return res.data.records;
}

async function getAlbumRecords(agent: AtpAgent, did: string) {
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: "app.rocksky.album",
    limit: 100,
  });

  return res.data.records;
}

async function insertScrobbles(scrobbles: Record[]) {}

async function main() {
  const agent = await getAtpAgent(did);
  const scrobbles = await getScrobbleRecords(agent, did);
  const songs = await getSongRecords(agent, did);
  const artists = await getArtistRecords(agent, did);
  const albums = await getAlbumRecords(agent, did);
  console.log(scrobbles);
  console.log(songs);
  console.log(artists);
  console.log(albums);

  consola.success(`${chalk.cyan(args[0])} Collections fetched successfully!`);

  process.exit(0);
}

await main();
