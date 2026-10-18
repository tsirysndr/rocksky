module Rocksky.Xrpc.App.Rocksky.Stats.WrappedQuery (wrappedSummaryQuery) where

import Drizzle.SQL (SQL)
import Drizzle.SQL as SQL
import Drizzle.Schema (tableSQL)
import Rocksky.Schema as T

-- One materialized scan keeps every aggregate on the same database snapshot.
wrappedSummaryQuery :: String -> String -> String -> SQL
wrappedSummaryQuery userId startDate endDate = SQL.template
  ["\n  WITH year_scrobbles AS MATERIALIZED (\n    SELECT timestamp, track_id, artist_id, album_id\n    FROM ",
  "\n    WHERE user_id = ",
  "\n      AND timestamp >= ",
  "\n      AND timestamp < ",
  "\n  ), track_counts AS MATERIALIZED (\n    SELECT track_id, count(*) AS plays FROM year_scrobbles GROUP BY track_id\n  ), artist_counts AS MATERIALIZED (\n    SELECT artist_id, count(*) AS plays FROM year_scrobbles GROUP BY artist_id\n  ), ranked_artists AS MATERIALIZED (\n    SELECT a.xata_id AS artist_id, a.genres, c.plays\n    FROM artist_counts c CROSS JOIN LATERAL (\n      SELECT xata_id, genres FROM ",
  "\n      WHERE xata_id = c.artist_id AND name != 'Various Artists'\n      OFFSET 0\n    ) a\n  ), daily AS MATERIALIZED (\n    SELECT DATE(timestamp) AS date, count(*) AS plays\n    FROM year_scrobbles GROUP BY DATE(timestamp)\n  ), prior_artists AS MATERIALIZED (\n    SELECT DISTINCT artist_id FROM ",
  "\n    WHERE user_id = ",
  " AND timestamp < ",
  "\n      AND artist_id IS NOT NULL\n  )\n  SELECT\n    (SELECT count(*) FROM year_scrobbles) AS \"totalScrobbles\",\n    (SELECT COALESCE(sum(c.plays * (\n        SELECT t.duration::bigint FROM ",
  " t WHERE t.xata_id = c.track_id\n      )), 0)::text FROM track_counts c\n    ) AS \"totalTime\",\n    COALESCE((SELECT jsonb_agg(r) FROM (\n      SELECT track_id AS \"trackId\", plays AS \"playCount\" FROM track_counts\n      ORDER BY plays DESC, track_id LIMIT 5\n    ) r), '[]'::jsonb) AS \"topTrackIds\",\n    COALESCE((SELECT jsonb_agg(r) FROM (\n      SELECT artist_id AS \"artistId\", plays AS \"playCount\" FROM ranked_artists\n      ORDER BY plays DESC, artist_id LIMIT 5\n    ) r), '[]'::jsonb) AS \"topArtistIds\",\n    COALESCE((SELECT jsonb_agg(r) FROM (\n      SELECT album_id AS \"albumId\", count(*) AS \"playCount\"\n      FROM year_scrobbles WHERE album_id IS NOT NULL GROUP BY album_id\n      ORDER BY count(*) DESC, album_id LIMIT 6\n    ) r), '[]'::jsonb) AS \"topAlbumIds\",\n    COALESCE((SELECT jsonb_agg(r) FROM (\n      SELECT genre, sum(a.plays) AS genre_count\n      FROM ranked_artists a CROSS JOIN LATERAL unnest(a.genres) AS genre\n      WHERE genre IS NOT NULL AND genre != '' GROUP BY genre\n      ORDER BY genre_count DESC, genre LIMIT 5\n    ) r), '[]'::jsonb) AS \"topGenres\",\n    COALESCE((SELECT jsonb_agg(r) FROM (\n      SELECT date::text, plays AS \"dayCount\" FROM daily ORDER BY date\n    ) r), '[]'::jsonb) AS daily,\n    COALESCE((SELECT jsonb_agg(r) FROM (\n      SELECT EXTRACT(HOUR FROM timestamp)::int AS hour, count(*) AS \"hourCount\"\n      FROM year_scrobbles GROUP BY EXTRACT(HOUR FROM timestamp)\n      ORDER BY count(*) DESC, hour LIMIT 1\n    ) r), '[]'::jsonb) AS hours,\n    COALESCE((SELECT jsonb_agg(r) FROM (\n      SELECT EXTRACT(MONTH FROM timestamp)::int AS month, count(*) AS \"monthCount\"\n      FROM year_scrobbles GROUP BY EXTRACT(MONTH FROM timestamp) ORDER BY month\n    ) r), '[]'::jsonb) AS months,\n    (SELECT count(*) FROM artist_counts c WHERE c.artist_id IS NOT NULL\n      AND NOT EXISTS (SELECT 1 FROM prior_artists p WHERE p.artist_id = c.artist_id)\n    ) AS \"newArtistsCount\"\n"]
  [tableSQL T.scrobbles, SQL.string userId, SQL.string startDate, SQL.string endDate, tableSQL T.artists, tableSQL T.scrobbles, SQL.string userId, SQL.string startDate, tableSQL T.tracks]
