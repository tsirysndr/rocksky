import {
  idleState,
  snapshot,
  playbackTime,
  type ReceiverState,
  type Track,
} from "./receiver.ts";

export interface Player {
  getMediaInformation(): unknown;
  getCurrentTimeSec(): number;
  getDurationSec(): number;
  getPlayerState(): string;
  getQueueManager():
    | { getItems(): unknown[]; getCurrentItemIndex(): number }
    | undefined;
  addEventListener(type: string, callback: (event: unknown) => void): void;
  removeEventListener(type: string, callback: (event: unknown) => void): void;
  play(): void;
  pause(): void;
  seek(position: number): void;
}
const sameTrack = (a: Track | null, b: Track | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.id === b.id &&
    a.title === b.title &&
    a.artist === b.artist &&
    a.album === b.album &&
    a.artwork === b.artwork &&
    a.duration === b.duration &&
    a.source === b.source);

/** Time events never read or parse the queue. Retain metadata references on clock ticks. */
export function observeReceiver(
  player: Player,
  events: Record<string, string>,
  publish: (state: ReceiverState) => void,
  mediaElement?: Pick<
    HTMLMediaElement,
    "readyState" | "currentTime" | "duration"
  >,
) {
  let state = idleState;
  const listeners: [string, (event: unknown) => void][] = [];
  function commit(next: ReceiverState) {
    if (sameTrack(state.track, next.track)) next.track = state.track;
    if (
      state.queue.length === next.queue.length &&
      state.queue.every((track, i) => sameTrack(track, next.queue[i]))
    )
      next.queue = state.queue;
    if (
      state.track === next.track &&
      state.queue === next.queue &&
      state.queueCount === next.queueCount &&
      state.phase === next.phase &&
      state.position === next.position &&
      state.duration === next.duration &&
      state.error === next.error
    )
      return;
    state = next;
    publish(state);
  }
  function currentTime() {
    // Read the decoded audio clock/duration when available, rather than trusting
    // a duration estimate supplied in sender metadata. All values are seconds.
    return mediaElement && mediaElement.readyState >= 1
      ? { position: mediaElement.currentTime, duration: mediaElement.duration }
      : {
          position: player.getCurrentTimeSec(),
          duration: player.getDurationSec(),
        };
  }
  function refresh() {
    const queue = player.getQueueManager();
    const items = queue?.getItems() ?? [];
    const start = Math.max(0, (queue?.getCurrentItemIndex() ?? -1) + 1);
    const next = snapshot({
      playerState: player.getPlayerState(),
      media: player.getMediaInformation(),
      ...currentTime(),
      // Only three covers are displayed. Don't decode thousands of queued tracks.
      items: items.slice(start, start + 3),
      index: -1,
    });
    next.queueCount = Math.max(0, items.length - start);
    if (state.error) {
      next.phase = "error";
      next.error = state.error;
    }
    commit(next);
  }
  function progress() {
    if (!state.track || state.phase === "idle") return;
    const actual = currentTime();
    const time = playbackTime(
      actual.position,
      actual.duration,
      state.track.duration,
    );
    if (time.position === state.position && time.duration === state.duration)
      return;
    commit({ ...state, ...time });
  }
  function recover() {
    state = { ...state, error: undefined };
    refresh();
  }
  function listen(name: string, callback: () => void) {
    const type = events[name];
    if (!type) return;
    player.addEventListener(type, callback);
    listeners.push([type, callback]);
  }
  for (const event of [
    "MEDIA_INFORMATION_CHANGED",
    "MEDIA_STATUS",
    "PAUSE",
    "BUFFERING",
    "ENDED",
    "EMPTIED",
  ])
    listen(event, refresh);
  for (const event of ["PLAYING", "PLAYER_LOAD_COMPLETE", "PLAYER_LOADING"])
    listen(event, recover);
  for (const event of ["TIME_UPDATE", "SEEKING", "SEEKED", "DURATION_CHANGE"])
    listen(event, progress);
  listen("ERROR", () =>
    commit({
      ...state,
      phase: "error",
      error:
        "This track could not be played. Check your Wi-Fi connection or try another audio format.",
    }),
  );
  refresh();
  return {
    progress,
    dispose: () =>
      listeners.forEach(([type, callback]) =>
        player.removeEventListener(type, callback),
      ),
  };
}
