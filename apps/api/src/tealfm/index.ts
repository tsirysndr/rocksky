import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common";
import chalk from "chalk";
import * as Play from "lexicon/types/fm/teal/alpha/feed/play";
import type { MusicbrainzTrack } from "types/track";

const SUBMISSION_CLIENT_AGENT = "rocksky/v0.0.1";

async function publishPlayingNow(
  agent: Agent,
  track: MusicbrainzTrack,
  duration: number
) {
  try {
    const rkey = TID.nextStr();
    const record: Play.Record = {
      $type: "fm.teal.alpha.feed.play",
      duration,
      trackName: track.name,
      playedTime: track.timestamp,
      artists: track.artist.map((artist) => ({
        artistMbid: artist.mbid,
        artistName: artist.name,
      })),
      releaseMbid: track.releaseMBID,
      releaseName: track.album,
      recordingMbId: track.trackMBID,
      submissionClientAgent: SUBMISSION_CLIENT_AGENT,
    };

    if (!Play.validateRecord(record).success) {
      console.log(Play.validateRecord(record));
      console.log(chalk.cyan(JSON.stringify(record, null, 2)));
      throw new Error("Invalid record");
    }

    const res = await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: "fm.teal.alpha.feed.play",
      rkey,
      record,
      validate: false,
    });
    const uri = res.data.uri;
    console.log(`tealfm Play record created at ${uri}`);
  } catch (error) {
    console.error("Error publishing teal.fm record:", error);
  }
}

export default { publishPlayingNow };
