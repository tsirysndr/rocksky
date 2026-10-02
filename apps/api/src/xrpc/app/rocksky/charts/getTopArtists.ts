import { consola } from "consola";
import type { Context } from "context";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { Effect, pipe } from "effect";
import type { Server } from "lexicon";
import type { ArtistViewBasic } from "lexicon/types/app/rocksky/artist/defs";
import type { QueryParams } from "lexicon/types/app/rocksky/charts/getTopArtists";
import { deepCamelCaseKeys } from "lib";
import { readQuery } from "lib/dbQuery";
import { transientDbRetry } from "lib/dbRetry";
import { queryCache } from "lib/queryCache";
import tables from "schema";

export default function (server: Server, ctx: Context) {
  const cached = queryCache(
    (params: QueryParams) =>
      pipe(
        { params, ctx },
        retrieve,
        Effect.flatMap(presentation),
        Effect.retry(transientDbRetry),
        Effect.timeout("120 seconds"),
      ),
    "2 minutes",
  );

  const getTopArtists = (params: QueryParams) =>
    pipe(
      cached(params),
      Effect.catchAll((err) => {
        consola.error(err);
        return Effect.succeed({ artists: [] });
      }),
    );

  server.app.rocksky.charts.getTopArtists({
    handler: async ({ params }) => {
      const result = await Effect.runPromise(getTopArtists(params));
      return {
        encoding: "application/json",
        body: result,
      };
    },
  });
}

const retrieve = ({
  params,
  ctx,
}: {
  params: QueryParams;
  ctx: Context;
}): Effect.Effect<{ data: TopArtist[] }, Error> => {
  return readQuery("Failed to retrieve top artists", async (db) => {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const dateConditions = [];
    if (params.startDate) {
      dateConditions.push(
        gte(tables.scrobbles.timestamp, new Date(params.startDate)),
      );
    }
    if (params.endDate) {
      dateConditions.push(
        lte(tables.scrobbles.timestamp, new Date(params.endDate)),
      );
    }

    if (params.did) {
      const user = await db
        .select({ id: tables.users.id })
        .from(tables.users)
        .where(
          or(
            eq(tables.users.did, params.did),
            eq(tables.users.handle, params.did),
          ),
        )
        .execute()
        .then((rows) => rows[0]);
      if (!user) return { data: [] };
      dateConditions.push(eq(tables.scrobbles.userId, user.id));
    }

    // Group before the metadata join so counts can use index-only scans.
    const artistCounts = db
      .select({
        artistId: tables.scrobbles.artistId,
        scrobbles: count().as("scrobbles"),
        uniqueListeners:
          sql<number>`count(DISTINCT ${tables.scrobbles.userId})`.as(
            "unique_listeners",
          ),
      })
      .from(tables.scrobbles)
      .where(and(...dateConditions))
      .groupBy(tables.scrobbles.artistId)
      .as("artist_counts");
    const topArtistsQuery = db
      .select({
        artistId: artistCounts.artistId,
        scrobbles: artistCounts.scrobbles,
        uniqueListeners: artistCounts.uniqueListeners,
      })
      .from(artistCounts)
      .innerJoin(tables.artists, eq(artistCounts.artistId, tables.artists.id))
      .where(ne(tables.artists.name, "Various Artists"))
      .orderBy(
        desc(
          params.did ? artistCounts.scrobbles : artistCounts.uniqueListeners,
        ),
        artistCounts.artistId,
      )
      .limit(limit)
      .offset(offset);

    const topArtistsData =
      !params.did && !params.startDate && !params.endDate
        ? ((
            await db.execute(sql`
          SELECT c.artist_id AS "artistId", c.scrobbles,
            c.unique_listeners AS "uniqueListeners"
          FROM chart_artists_mv c
          JOIN ${tables.artists} a ON a.xata_id = c.artist_id
          WHERE a.name != 'Various Artists'
          ORDER BY c.unique_listeners DESC, c.artist_id
          LIMIT ${limit} OFFSET ${offset}
        `)
          ).rows as Array<{
            artistId: string;
            scrobbles: number;
            uniqueListeners: number;
          }>)
        : await topArtistsQuery.execute();
    consola.info(`Found ${topArtistsData.length} top artists`);

    if (topArtistsData.length === 0) {
      return { data: [] };
    }

    const artistIds = topArtistsData
      .map((a) => a.artistId)
      .filter((id): id is string => id !== null);
    consola.info(`Extracted ${artistIds.length} artist IDs`);

    const artists = await db
      .select({
        id: tables.artists.id,
        name: tables.artists.name,
        picture: tables.artists.picture,
        sha256: tables.artists.sha256,
        uri: tables.artists.uri,
        genres: tables.artists.genres,
      })
      .from(tables.artists)
      .where(inArray(tables.artists.id, artistIds))
      .execute();
    consola.info(`Retrieved ${artists.length} artist details`);

    const artistMap = new Map(artists.map((artist) => [artist.id, artist]));

    const listenersMap = new Map(
      topArtistsData.map((item) => [
        item.artistId,
        Number(item.uniqueListeners),
      ]),
    );

    const result: TopArtist[] = topArtistsData
      .map((item) => {
        const artist = artistMap.get(item.artistId!);
        if (!artist) return null;

        return {
          id: artist.id,
          name: artist.name,
          picture: artist.picture,
          sha256: artist.sha256,
          uri: artist.uri,
          play_count: Number(item.scrobbles),
          unique_listeners: listenersMap.get(item.artistId!) || 0,
          tags: artist.genres || [],
        };
      })
      .filter((item): item is TopArtist => item !== null);
    consola.info(`Returning ${result.length} top artists with complete data`);

    return { data: result };
  });
};

const presentation = ({
  data,
}: {
  data: TopArtist[];
}): Effect.Effect<{ artists: ArtistViewBasic[] }, never> => {
  return Effect.sync(() => ({ artists: deepCamelCaseKeys(data) }));
};

type TopArtist = {
  id: string;
  name: string;
  picture: string | null;
  sha256: string;
  uri: string | null;
  play_count: number;
  unique_listeners: number;
  tags: string[];
};
