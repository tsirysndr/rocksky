import { sql } from "drizzle-orm";

// Reuse the shared pairs for ranking and cards instead of scanning each
// neighbour's entire library a second time. Hydrate only the top five artists.
export const neighboursQuery = (userId: string) => sql`
        WITH target AS MATERIALIZED (
          SELECT artist_id
          FROM user_artists_mv
          WHERE user_id = ${userId}
        ),
        shared AS MATERIALIZED (
          SELECT ua.user_id, ua.artist_id, ua.play_count
          FROM user_artists_mv ua
          JOIN target t ON t.artist_id = ua.artist_id
          WHERE ua.user_id <> ${userId}
        ),
        neighbours AS MATERIALIZED (
          SELECT user_id, count(*)::int AS shared_count
          FROM shared
          GROUP BY user_id
          ORDER BY shared_count DESC, user_id
          LIMIT 50
        ),
        top_shared AS (
          SELECT s.user_id, s.artist_id,
            row_number() OVER (
              PARTITION BY s.user_id ORDER BY s.play_count DESC, s.artist_id
            ) AS rn
          FROM shared s JOIN neighbours n ON n.user_id = s.user_id
        )
        SELECT
          n.user_id,
          n.shared_count,
          u.did,
          u.handle,
          u.display_name,
          u.avatar,
          (SELECT count(*)::int FROM target) AS target_artist_count,
          coalesce(
            json_agg(
              json_build_object(
                'id', a.xata_id,
                'name', a.name,
                'picture', a.picture,
                'uri', a.uri
              )
              ORDER BY ts.rn
            ) FILTER (WHERE a.xata_id IS NOT NULL),
            '[]'
          ) AS top_artists
        FROM neighbours n
        JOIN users u ON u.xata_id = n.user_id
        LEFT JOIN top_shared ts ON ts.user_id = n.user_id AND ts.rn <= 5
        LEFT JOIN artists a ON a.xata_id = ts.artist_id
        GROUP BY n.user_id, n.shared_count, u.did, u.handle, u.display_name, u.avatar
        ORDER BY n.shared_count DESC, n.user_id
      `;
