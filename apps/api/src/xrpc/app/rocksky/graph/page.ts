import type { Context } from "context";
import { sql } from "drizzle-orm";
import type { ProfileViewBasic } from "lexicon/types/app/rocksky/actor/defs";

const profile = sql`jsonb_build_object(
  'id', u.xata_id, 'did', u.did, 'handle', u.handle,
  'displayName', u.display_name, 'avatar', u.avatar,
  'createdAt', to_char(u.xata_createdat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updatedAt', to_char(u.xata_updatedat, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;

export async function graphPage(
  ctx: Context,
  params: {
    actor: string;
    limit?: number;
    cursor?: string;
    dids?: string[];
  },
  followers: boolean,
) {
  const owner = followers ? sql`f.subject_did` : sql`f.follower_did`;
  const target = followers ? sql`f.follower_did` : sql`f.subject_did`;
  const filter = sql`${owner} = ${params.actor}${
    params.dids?.length
      ? sql` AND ${target} IN (${sql.join(
          params.dids.map((did) => sql`${did}`),
          sql`, `,
        )})`
      : sql``
  }`;
  const cursor = params.cursor
    ? sql` AND f.xata_createdat < ${new Date(Number(params.cursor))}`
    : sql``;
  const result = await ctx.db.execute(sql`
    WITH page AS (
      SELECT ${profile} AS profile, f.xata_createdat AS followed_at
      FROM follows f LEFT JOIN users u ON u.did = ${target}
      WHERE ${filter}${cursor}
      ORDER BY f.xata_createdat DESC LIMIT ${params.limit ?? 50}
    )
    SELECT coalesce((SELECT ${profile} FROM users u WHERE u.did = ${params.actor} LIMIT 1), '{}'::jsonb) AS subject,
      coalesce((SELECT jsonb_agg(profile ORDER BY followed_at DESC) FROM page), '[]'::jsonb) AS profiles,
      (SELECT (extract(epoch FROM min(followed_at)) * 1000)::bigint::text FROM page) AS cursor,
      (SELECT count(*)::int FROM follows f WHERE ${filter}) AS count
  `);
  const row = result.rows[0] as {
    subject: ProfileViewBasic;
    profiles: ProfileViewBasic[];
    cursor: string | null;
    count: number;
  };
  return { ...row, cursor: row.cursor ?? undefined };
}
