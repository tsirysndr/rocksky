import { TID } from "@atproto/common";
import { consola } from "consola";
import chalk from "chalk";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import * as Playlist from "lexicon/types/app/rocksky/playlist";
import { createAgent } from "lib/agent";
import { StringCodec } from "nats";
import tables from "schema";

export function onNewPlaylist(ctx: Context) {
  const sc = StringCodec();
  const sub = ctx.nc.subscribe("rocksky.playlist");
  (async () => {
    for await (const m of sub) {
      const payload: {
        id: string;
        did: string;
      } = JSON.parse(sc.decode(m.data));
      consola.info(
        `New playlist: ${chalk.cyan(payload.did)} - ${chalk.greenBright(payload.id)}`,
      );
      await putPlaylistRecord(ctx, payload);
    }
  })();
}

async function putPlaylistRecord(
  ctx: Context,
  payload: { id: string; did: string },
) {
  const agent = await createAgent(ctx.oauthClient, payload.did);

  if (!agent) {
    consola.error(
      `Failed to create agent, skipping playlist: ${chalk.cyan(payload.id)} for ${chalk.greenBright(payload.did)}`,
    );
    return;
  }

  const [playlist] = await ctx.db
    .select()
    .from(tables.playlists)
    .where(eq(tables.playlists.id, payload.id))
    .execute();

  let rkey = TID.nextStr();

  if (playlist.uri) {
    rkey = playlist.uri.split("/").pop();
  }

  const record: {
    $type: string;
    name: string;
    description?: string;
    createdAt: string;
    pictureUrl?: string;
    spotifyLink?: string;
    tidalLink?: string;
    appleMusicLink?: string;
    youtubeLink?: string;
  } = {
    $type: "app.rocksky.playlist",
    name: playlist.name,
    description: playlist.description,
    createdAt: new Date().toISOString(),
    pictureUrl: playlist.picture,
    spotifyLink: playlist.spotifyLink,
  };

  if (!Playlist.validateRecord(record)) {
    consola.error(`Invalid record: ${chalk.redBright(JSON.stringify(record))}`);
    return;
  }

  try {
    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "app.rocksky.playlist",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    consola.info(`Playlist record created: ${chalk.greenBright(uri)}`);
    await ctx.db
      .update(tables.playlists)
      .set({ uri })
      .where(eq(tables.playlists.id, payload.id))
      .execute();
  } catch (e) {
    consola.error(`Failed to put record: ${chalk.redBright(e.message)}`);
  }

  const [updatedPlaylist] = await ctx.db
    .select()
    .from(tables.playlists)
    .where(eq(tables.playlists.id, payload.id))
    .execute();

  await ctx.meilisearch.post(
    `indexes/playlists/documents?primaryKey=id`,
    updatedPlaylist,
  );
}
