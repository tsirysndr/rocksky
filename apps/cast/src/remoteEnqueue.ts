import type { EnqueueCommand, RemoteQueueItem } from "@rocksky/sdk/remote";
import { castRequests, abortableDelay } from "../../shared/castRequests.ts";

/** Selected track first; prepare subsequent uploads through the same paced
 * request scheduler used by the senders. Never send an access token in media. */
export function createRemoteEnqueue(
  accessToken: () => string,
  send: (type: string, fields: Record<string, unknown>) => void,
  queue: () => {
    itemId: number;
    media?: { customData?: { rocksky?: { queueId?: string } } };
  }[],
  index: () => number,
  requests: Pick<typeof castRequests, "fetch"> = castRequests,
) {
  let active: AbortController | undefined;
  let sequence = 0;
  let generation = 0;
  let pending: Promise<void> = Promise.resolve();
  const cancel = () => {
    generation++;
    active?.abort();
    active = undefined;
    pending = Promise.resolve();
  };
  async function enqueue(command: EnqueueCommand) {
    if (!command.tracks.length) return;
    if (command.tracks.some((track) => !track.uploadId))
      throw new Error(
        "Only uploaded tracks can be added remotely to Chromecast.",
      );
    if (command.mode === "now") cancel();
    const currentGeneration = generation;
    const result = pending.catch(() => {}).then(async () => {
      if (currentGeneration === generation) await prepareQueue(command);
    });
    pending = result;
    return result;
  }
  async function prepareQueue(command: EnqueueCommand) {
    const controller = new AbortController();
    active = controller;
    const { signal } = controller;
    const id = `remote-${Date.now()}-${++sequence}`;
    const tracks = [...command.tracks];
    let start = Number.isInteger(command.startIndex)
      ? Math.max(0, Math.min(tracks.length - 1, command.startIndex))
      : 0;
    if (command.shuffle) {
      const [selected] = tracks.splice(start, 1);
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }
      tracks.unshift(selected);
      start = 0;
    }
    const response = await requests.fetch(
      "https://api.rocksky.app/uploads/stream-token?purpose=cast",
      {
        headers: { authorization: `Bearer ${accessToken()}` },
        signal,
      },
    );
    if (!response.ok)
      throw new Error("Could not authorize Chromecast streaming.");
    const result = (await response.json()) as { token?: string };
    if (!result.token) throw new Error("Missing Chromecast stream token.");
    async function prepare(track: RemoteQueueItem) {
      const url = `https://api.rocksky.app/uploads/${encodeURIComponent(track.uploadId!)}/stream?token=${encodeURIComponent(result.token!)}`;
      const head = await requests.fetch(url, { method: "HEAD", signal });
      const contentType = head.headers.get("content-type")?.split(";")[0];
      if (
        !head.ok ||
        !contentType ||
        !(contentType.startsWith("audio/") || contentType === "application/ogg")
      )
        throw new Error("Could not identify the uploaded audio format.");
      return {
        autoplay: true,
        preloadTime: 20,
        media: {
          contentId: url,
          contentType,
          streamType: "BUFFERED",
          duration: (track.durationMs ?? 0) / 1000,
          metadata: {
            metadataType: 3,
            title: track.title,
            artist: track.artist,
            albumName: track.album,
            albumArtist: track.albumArtist,
            images: track.albumArt ? [{ url: track.albumArt }] : [],
          },
          customData: { rocksky: { source: "uploaded", queueId: id, track } },
        },
      };
    }
    const replacing = command.mode === "now" || !queue().length;
    const anchor =
      command.mode === "next" ? queue()[index() + 1]?.itemId : undefined;
    if (replacing) {
      const selected = await prepare(tracks[start]);
      if (signal.aborted) return;
      send("QUEUE_LOAD", {
        items: [selected],
        startIndex: 0,
        autoplay: true,
        repeatMode: "REPEAT_OFF",
      });
      for (
        let attempt = 0;
        attempt < 50 &&
        !queue().some(
          (entry) => entry.media?.customData?.rocksky?.queueId === id,
        );
        attempt++
      )
        await abortableDelay(100, signal);
    }
    const selectedId = replacing
      ? queue().find(
          (entry) => entry.media?.customData?.rocksky?.queueId === id,
        )?.itemId
      : undefined;
    if (replacing && selectedId === undefined) return;
    const parts = replacing
      ? [
          { tracks: tracks.slice(start + 1), before: undefined },
          { tracks: tracks.slice(0, start), before: selectedId },
        ]
      : [{ tracks, before: anchor }];
    for (const part of parts)
      for (const track of part.tracks) {
        const item = await prepare(track);
        if (signal.aborted) return;
        // A new queue submitted by another sender supersedes this background job.
        if (
          replacing &&
          !queue().some(
            (entry) => entry.media?.customData?.rocksky?.queueId === id,
          )
        )
          return;
        send("QUEUE_INSERT", { items: [item], insertBefore: part.before });
      }
  }
  return { enqueue, cancel };
}
