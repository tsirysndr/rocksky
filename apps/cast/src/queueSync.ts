import type { Player } from "./receiverUpdates.ts";

export const QUEUE_SYNC_NAMESPACE = "urn:x-cast:app.rocksky.queue";
interface Message { senderId: string; data: unknown }
export interface QueueSyncContext {
  addCustomMessageListener(namespace: string, listener: (event: Message) => void): void;
  removeCustomMessageListener(namespace: string, listener: (event: Message) => void): void;
  sendCustomMessage(namespace: string, senderId: string | undefined, message: unknown): void;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

/** CAF status only includes a window of queue items. Serve bounded pages from
 * the actual receiver queue instead of disabling its message-size protection. */
export function attachQueueSync(context: QueueSyncContext, player: Player,
  audio?: Pick<HTMLAudioElement, "readyState" | "currentTime" | "duration">,
  events: Record<string, string> = {}) {
  let previous = "";
  let revision = 0;
  const playbackState = () => {
    const queue = player.getQueueManager();
    const items = queue?.getItems() ?? [];
    const index = queue?.getCurrentItemIndex() ?? -1;
    const current = object(items[index]);
    return {
      media: current.media ?? player.getMediaInformation(),
      currentItemId: current.itemId,
      playerState: player.getPlayerState(),
      currentTime: audio && audio.readyState >= 1 ? audio.currentTime : player.getCurrentTimeSec(),
      duration: audio && audio.readyState >= 1 && Number.isFinite(audio.duration)
        ? audio.duration : player.getDurationSec(),
    };
  };
  const listener = (event: Message) => {
    let request;
    try { request = object(typeof event.data === "string" ? JSON.parse(event.data) : event.data); }
    catch { return; }
    if (request.type !== "snapshot") return;
    const items = player.getQueueManager()?.getItems() ?? [];
    const first = object(object(items[0]).media);
    const signature = items.map((entry) => object(entry).itemId).join(",") +
      JSON.stringify([first.contentId, first.customData]);
    if (signature !== previous) { previous = signature; revision++; }
    const offset = request.revision === revision && Number.isInteger(request.offset)
      ? Math.max(0, Math.min(items.length, Number(request.offset))) : 0;
    const state = playbackState();
    const page = request.revision === revision && request.offset === undefined
      ? undefined : items.slice(offset, offset + 16);
    const response = { type: "snapshot", requestId: request.requestId, revision, offset, total: items.length, state, items: page };
    // Leave headroom under Cast's 64 KiB transport limit, including UTF-8 text.
    while (page && page.length > 1 && new TextEncoder().encode(JSON.stringify(response)).length > 48000)
      page.pop();
    context.sendCustomMessage(QUEUE_SYNC_NAMESPACE, event.senderId, response);
  };
  context.addCustomMessageListener(QUEUE_SYNC_NAMESPACE, listener);
  // Track transitions can invalidate Chrome's cached media session. Send the
  // current receiver state independently of SDK status and paginated queue reads.
  const broadcast = () => {
    try {
      context.sendCustomMessage(QUEUE_SYNC_NAMESPACE, undefined, { type: "status", state: playbackState() });
    } catch { /* No connected sender, or the receiver is shutting down. */ }
  };
  const types = [events.MEDIA_STATUS, events.PLAYER_LOAD_COMPLETE, events.PLAYING, events.PAUSE]
    .filter((type): type is string => !!type);
  for (const type of types) player.addEventListener(type, broadcast);
  const timer = setInterval(broadcast, 2000);
  return () => {
    clearInterval(timer);
    for (const type of types) player.removeEventListener(type, broadcast);
    context.removeCustomMessageListener(QUEUE_SYNC_NAMESPACE, listener);
  };
}
