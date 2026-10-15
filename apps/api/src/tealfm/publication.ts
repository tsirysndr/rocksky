import type { Agent } from "@atproto/api";
import * as Play from "lexicon/types/fm/teal/feed/play";
import type { MusicbrainzTrack } from "types/track";
import { findDurableRecord, publishDurableRecord } from "lib/durableRecord";

const SUBMISSION_CLIENT_AGENT = "rocksky/v0.0.1";
const PLAY_COLLECTION = "fm.teal.feed.play";
const STATUS_COLLECTION = "fm.teal.actor.status";

function toMbidUri(mbid?: string | null): string | undefined {
  if (!mbid) return undefined;
  return mbid.startsWith("mbid:") ? mbid : `mbid:${mbid}`;
}

function toTealArtist(artist: MusicbrainzTrack["artist"][number]) {
  const artistMbId = toMbidUri(artist.mbid);
  return {
    artistName: artist.name,
    ...(artistMbId ? { artistMbId } : {}),
  };
}

export function tealRecord(
  track: MusicbrainzTrack,
  duration: number,
): Play.Record {
  const record: Play.Record = {
    $type: PLAY_COLLECTION,
    duration,
    trackName: track.name,
    playedTime: track.timestamp,
    artists: track.artist.map(toTealArtist),
    ...(track.releaseMBID ? { releaseMbId: toMbidUri(track.releaseMBID) } : {}),
    releaseName: track.album,
    ...(track.trackMBID ? { recordingMbId: toMbidUri(track.trackMBID) } : {}),
    submissionClientAgent: SUBMISSION_CLIENT_AGENT,
  };
  if (!Play.validateRecord(record).success)
    throw new Error("Invalid Teal record");
  return record;
}

export async function publishTealRecord(
  agent: Agent,
  record: Play.Record,
  rkey: string,
  now?: number,
) {
  if (!Number.isFinite(Date.parse(record.playedTime)))
    throw new Error("Invalid Teal listening time");
  const repo = agent.assertDid;
  const lookup = () =>
    agent.com.atproto.repo.getRecord({
      repo,
      collection: PLAY_COLLECTION,
      rkey,
    });
  if (!(await findDurableRecord(lookup))) {
    // Preserve the existing mirror dedup check, only before first publication.
    // Our own stable record is recovered separately so status failures retry.
    const pages = await Promise.all(
      ["fm.teal.alpha.feed.play", PLAY_COLLECTION].map((collection) =>
        agent.com.atproto.repo.listRecords({ repo, collection, limit: 5 }),
      ),
    );
    const duplicate = pages.some((page) =>
      page.data.records.some(({ value }) => {
        const play = value as Play.Record;
        return (
          ((record.recordingMbId &&
            (play.recordingMbId === record.recordingMbId ||
              play.recordingMbId ===
                record.recordingMbId.replace(/^mbid:/, ""))) ||
            (play.trackName === record.trackName &&
              Math.abs(play.duration - record.duration) < 4)) &&
          Math.abs(
            Date.parse(play.playedTime) - Date.parse(record.playedTime),
          ) < 60_000
        );
      }),
    );
    if (duplicate) return;
    await publishDurableRecord(
      () =>
        agent.com.atproto.repo.putRecord({
          repo,
          collection: PLAY_COLLECTION,
          rkey,
          record,
          validate: false,
          swapRecord: null,
        }),
      lookup,
    );
  }
  await publishTealStatus(agent, record, now);
}

export async function publishTealStatus(
  agent: Agent,
  item: Play.Record,
  now = Date.now(),
) {
  const time = Date.parse(item.playedTime);
  const expiry = time + 10 * 60_000;
  if (!Number.isFinite(time)) throw new Error("Invalid Teal listening time");
  // Frozen listening time prevents retries/imports from reviving stale status.
  if (expiry <= now) return;
  let swapRecord: string | null = null;
  try {
    const current = await agent.com.atproto.repo.getRecord({
      repo: agent.assertDid,
      collection: STATUS_COLLECTION,
      rkey: "self",
    });
    const currentTime = Date.parse(
      (current.data.value as { time: string }).time,
    );
    if (!Number.isFinite(currentTime))
      throw new Error("Invalid existing Teal status time");
    if (currentTime >= time) return;
    if (!current.data.cid) throw new Error("Missing Teal status CID");
    swapRecord = current.data.cid;
  } catch (error) {
    if (error?.error !== "RecordNotFound") throw error;
  }
  // A concurrent newer write invalidates this CAS. The durable retry rereads it.
  await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: STATUS_COLLECTION,
    rkey: "self",
    swapRecord,
    record: {
      $type: STATUS_COLLECTION,
      item: { ...item, $type: "fm.teal.feed.defs#playView" },
      time: new Date(time).toISOString(),
      expiry: new Date(expiry).toISOString(),
    },
  });
}
