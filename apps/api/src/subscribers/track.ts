import chalk from "chalk";
import { consola } from "consola";
import type { Context } from "context";
import { eq } from "drizzle-orm";
import _ from "lodash";
import { StringCodec } from "nats";
import tables from "schema";
import { indexAlbums, indexArtists, indexTracks } from "typesense/search";

export function onNewTrack(ctx: Context) {
  const sc = StringCodec();
  const sub = ctx.nc.subscribe("rocksky.track");
  (async () => {
    for await (const m of sub) {
      try {
        const payload: {
          track: { xata_id: string };
          artist_album: {
            artist_id: { xata_id: string };
            album_id: { xata_id: string };
          };
        } = JSON.parse(sc.decode(m.data));

        const [tracks, artists, albums] = await Promise.all([
          ctx.db
            .select()
            .from(tables.tracks)
            .where(eq(tables.tracks.id, payload.track.xata_id))
            .execute(),
          ctx.db
            .select()
            .from(tables.artists)
            .where(
              eq(tables.artists.id, payload.artist_album.artist_id.xata_id),
            )
            .execute(),
          ctx.db
            .select()
            .from(tables.albums)
            .where(eq(tables.albums.id, payload.artist_album.album_id.xata_id))
            .execute(),
        ]);

        consola.info(`New track: ${chalk.cyan(_.get(tracks, "0.title"))}`);

        const results = await Promise.allSettled([
          indexAlbums(albums),
          indexArtists(artists),
          indexTracks(tracks),
        ]);
        for (const r of results) {
          if (r.status === "rejected") {
            consola.warn("[typesense] index failed:", r.reason);
          }
        }
      } catch (e) {
        consola.error("rocksky.track handler error:", e);
      }
    }
  })().catch((e) => consola.error("rocksky.track subscriber crashed:", e));
}
