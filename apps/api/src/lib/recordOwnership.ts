// Whether a user already has their own copy of a catalogue record, and a
// short-lived claim that stops concurrent scrobbles from each publishing one.
//
// `user_artists` / `user_albums` / `user_tracks` rows are not always the
// user's own records: `publishScrobble` fills them with the global row's uri
// (whoever first published the artist), and ingest only overwrites that once
// the user's own record comes through Jetstream. Only a uri under the user's
// DID proves there is a record in their repo to reuse.

export function ownsRecord(uri: string | null | undefined, did: string) {
  return typeof uri === "string" && uri.startsWith(`at://${did}/`);
}

// Postgres only learns about a put after Jetstream has indexed it, so the
// ownership check cannot see a put that is still in flight. Two clients
// reporting the same play (or the next track of the same album) within that
// window each published their own artist/album/song record. The claim is
// scoped per identity hash and outlives ingest by a wide margin; it is
// released again when the put fails so the next scrobble retries it.
export const RECORD_PUT_CLAIM_TTL_SECONDS = 15 * 60;

type RedisSetNx = {
  set(
    key: string,
    value: string,
    options: { NX: true; EX: number },
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

function claimKey(did: string, collection: string, hash: string) {
  return `record-put:v1:${did}:${collection}:${hash}`;
}

export async function claimRecordPut(
  redis: RedisSetNx,
  did: string,
  collection: string,
  hash: string,
): Promise<boolean> {
  const result = await redis.set(claimKey(did, collection, hash), "1", {
    NX: true,
    EX: RECORD_PUT_CLAIM_TTL_SECONDS,
  });
  return result === "OK";
}

export async function releaseRecordPut(
  redis: RedisSetNx,
  did: string,
  collection: string,
  hash: string,
): Promise<void> {
  await redis.del(claimKey(did, collection, hash));
}

// Publish a record once per claim window. A rejected claim means another
// request is already publishing (or just published) the same record.
export async function putRecordOnce(
  redis: RedisSetNx,
  did: string,
  collection: string,
  hash: string,
  put: () => Promise<string | null>,
): Promise<string | null> {
  if (!(await claimRecordPut(redis, did, collection, hash))) return null;
  try {
    const uri = await put();
    if (!uri) await releaseRecordPut(redis, did, collection, hash);
    return uri;
  } catch (e) {
    await releaseRecordPut(redis, did, collection, hash);
    throw e;
  }
}
