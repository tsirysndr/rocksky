import { sql } from "drizzle-orm";
import tables from "schema";

export interface WrappedSummary {
  totalScrobbles: string;
  totalTime: string;
  topTrackIds: Array<{ trackId: string | null; playCount: number }>;
  topArtistIds: Array<{ artistId: string; playCount: number }>;
  topAlbumIds: Array<{ albumId: string; playCount: number }>;
  topGenres: Array<{ genre: string; genre_count: number }>;
  daily: Array<{ date: string; dayCount: number }>;
  hours: Array<{ hour: number; hourCount: number }>;
  months: Array<{ month: number; monthCount: number }>;
  newArtistsCount: string;
}

/** Scan the year's covering index once, then aggregate the materialized rows.
 * Metadata joins happen after grouping: one lookup per track/artist, not play.
 * One statement also keeps all these figures on the same database snapshot.
 */
export const wrappedSummaryQuery = (
  userId: string,
  startDate: Date,
  endDate: Date,
) => sql`
  WITH year_scrobbles AS MATERIALIZED (
    SELECT timestamp, track_id, artist_id, album_id
    FROM ${tables.scrobbles}
    WHERE user_id = ${userId}
      AND timestamp >= ${startDate.toISOString()}
      AND timestamp < ${endDate.toISOString()}
  ), track_counts AS MATERIALIZED (
    SELECT track_id, count(*) AS plays FROM year_scrobbles GROUP BY track_id
  ), artist_counts AS MATERIALIZED (
    SELECT artist_id, count(*) AS plays FROM year_scrobbles GROUP BY artist_id
  ), ranked_artists AS MATERIALIZED (
    SELECT a.xata_id AS artist_id, a.genres, c.plays
    FROM artist_counts c CROSS JOIN LATERAL (
      SELECT xata_id, genres FROM ${tables.artists}
      WHERE xata_id = c.artist_id AND name != 'Various Artists'
      OFFSET 0
    ) a
  ), daily AS MATERIALIZED (
    SELECT DATE(timestamp) AS date, count(*) AS plays
    FROM year_scrobbles GROUP BY DATE(timestamp)
  ), prior_artists AS MATERIALIZED (
    SELECT DISTINCT artist_id FROM ${tables.scrobbles}
    WHERE user_id = ${userId} AND timestamp < ${startDate.toISOString()}
      AND artist_id IS NOT NULL
  )
  SELECT
    (SELECT count(*) FROM year_scrobbles) AS "totalScrobbles",
    (SELECT COALESCE(sum(c.plays * (
        SELECT t.duration::bigint FROM ${tables.tracks} t WHERE t.xata_id = c.track_id
      )), 0)::text FROM track_counts c
    ) AS "totalTime",
    COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT track_id AS "trackId", plays AS "playCount" FROM track_counts
      ORDER BY plays DESC, track_id LIMIT 5
    ) r), '[]'::jsonb) AS "topTrackIds",
    COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT artist_id AS "artistId", plays AS "playCount" FROM ranked_artists
      ORDER BY plays DESC, artist_id LIMIT 5
    ) r), '[]'::jsonb) AS "topArtistIds",
    COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT album_id AS "albumId", count(*) AS "playCount"
      FROM year_scrobbles WHERE album_id IS NOT NULL GROUP BY album_id
      ORDER BY count(*) DESC, album_id LIMIT 5
    ) r), '[]'::jsonb) AS "topAlbumIds",
    COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT genre, sum(a.plays) AS genre_count
      FROM ranked_artists a CROSS JOIN LATERAL unnest(a.genres) AS genre
      WHERE genre IS NOT NULL AND genre != '' GROUP BY genre
      ORDER BY genre_count DESC, genre LIMIT 5
    ) r), '[]'::jsonb) AS "topGenres",
    COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT date::text, plays AS "dayCount" FROM daily ORDER BY date
    ) r), '[]'::jsonb) AS daily,
    COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT EXTRACT(HOUR FROM timestamp)::int AS hour, count(*) AS "hourCount"
      FROM year_scrobbles GROUP BY EXTRACT(HOUR FROM timestamp)
      ORDER BY count(*) DESC, hour LIMIT 1
    ) r), '[]'::jsonb) AS hours,
    COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT EXTRACT(MONTH FROM timestamp)::int AS month, count(*) AS "monthCount"
      FROM year_scrobbles GROUP BY EXTRACT(MONTH FROM timestamp) ORDER BY month
    ) r), '[]'::jsonb) AS months,
    (SELECT count(*) FROM artist_counts c WHERE c.artist_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM prior_artists p WHERE p.artist_id = c.artist_id)
    ) AS "newArtistsCount"
`;
