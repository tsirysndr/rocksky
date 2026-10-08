import type { Player } from "./receiverUpdates.ts";

export const QUEUE_SYNC_NAMESPACE = "urn:x-cast:app.rocksky.queue";
interface Message { senderId: string; data: unknown }
export interface QueueSyncContext {
  addCustomMessageListener(namespace: string, listener: (event: Message) => void): void;
  removeCustomMessageListener(namespace: string, listener: (event: Message) => void): void;
  sendCustomMessage(namespace: string, senderId: string, message: unknown): void;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

/** CAF status only includes a window of queue items. Serve bounded pages from
 * the actual receiver queue instead of disabling its message-size protection. */
export function attachQueueSync(context: QueueSyncContext, player: Player,
  audio?: Pick<HTMLAudioElement, "readyState" | "currentTime" | "duration">) {
  let previous = "";
  let revision = 0;
  const listener = (event: Message) => {
    const request = object(event.data);
    if (request.type !== "snapshot") return;
    const queue = player.getQueueManager();
    const items = queue?.getItems() ?? [];
    const index = queue?.getCurrentItemIndex() ?? -1;
    const first = object(object(items[0]).media);
    const signature = items.map((entry) => object(entry).itemId).join(",") +
      JSON.stringify([first.contentId, first.customData]);
    if (signature !== previous) { previous = signature; revision++; }
    const offset = request.revision === revision && Number.isInteger(request.offset)
      ? Math.max(0, Math.min(items.length, Number(request.offset))) : 0;
    const current = object(items[index]);
    const state = {
      media: current.media ?? player.getMediaInformation(),
      currentItemId: current.itemId,
      playerState: player.getPlayerState(),
      currentTime: audio && audio.readyState >= 1 ? audio.currentTime : player.getCurrentTimeSec(),
      duration: audio && audio.readyState >= 1 && Number.isFinite(audio.duration)
        ? audio.duration : player.getDurationSec(),
    };
    const page = request.revision === revision && request.offset === undefined
      ? undefined : items.slice(offset, offset + 16);
    const response = { type: "snapshot", requestId: request.requestId, revision, offset, total: items.length, state, items: page };
    // Leave headroom under Cast's 64 KiB transport limit, including UTF-8 text.
    while (page && page.length > 1 && new TextEncoder().encode(JSON.stringify(response)).length > 48000)
      page.pop();
    context.sendCustomMessage(QUEUE_SYNC_NAMESPACE, event.senderId, response);
  };
  context.addCustomMessageListener(QUEUE_SYNC_NAMESPACE, listener);
  return () => context.removeCustomMessageListener(QUEUE_SYNC_NAMESPACE, listener);
}
