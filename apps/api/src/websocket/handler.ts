import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import jwt from "jsonwebtoken";
import { env } from "lib/env";
import { createHash } from "node:crypto";
import lovedTracks from "schema/loved-tracks";
import tracks from "schema/tracks";
import users from "schema/users";
import { v4 as uuidv4 } from "uuid";
import z from "zod";

// Define the schema for the incoming message
const ControlMessageSchema = z.object({
  type: z.string(),
  target: z.string().optional(),
  action: z.string(),
  args: z.any().optional(),
  token: z.string(),
});

type ControlMessage = z.infer<typeof ControlMessageSchema>;

const RegisterDeviceSchema = z.object({
  type: z.literal("register"),
  clientName: z.string(),
  token: z.string(),
});

type RegisterDeviceMessage = z.infer<typeof RegisterDeviceSchema>;

const MessageSchema = z.object({
  type: z.literal("message"),
  data: z.any(),
  device_id: z.string(),
  token: z.string(),
});

type Message = z.infer<typeof MessageSchema>;

const devices: Record<string, WebSocket> = {};
const deviceNames: Record<string, string> = {};
const userDevices: Record<string, string[]> = {};

// Pending song.stopped timers keyed by DID. song.stopped is debounced by 15s
// so that a status=0/status=1 oscillation from a paused player doesn't create
// a rapid PDS delete/create/delete loop.
const pendingStop = new Map<string, ReturnType<typeof setTimeout>>();

function handleWebsocket(c: Context) {
  return {
    async onMessage(event, ws) {
      try {
        if (event.data === "ping") {
          ws.send("pong");
          return;
        }
        const message = JSON.parse(event.data);
        const controlMessage = ControlMessageSchema.safeParse(message);
        const registerMessage = RegisterDeviceSchema.safeParse(message);
        const deviceMessage = MessageSchema.safeParse(message);

        if (deviceMessage.success) {
          const { data, device_id, token } = deviceMessage.data;
          const { did } = jwt.verify(token, env.JWT_SECRET, {
            ignoreExpiration: true,
          });

          // ── Enrichment & NATS events (once, outside the device loop) ──
          if (data.type === "track") {
            const sha256 = createHash("sha256")
              .update(
                `${data.title} - ${data.artist} - ${data.album}`.toLowerCase(),
              )
              .digest("hex");

            const [cachedTrack, cachedLikes] =
              await Promise.all([
                ctx.redis.get(`track:${sha256}`),
                ctx.redis.get(`likes:${did}:${sha256}`),
              ]);

            // Like status
            if (cachedLikes) {
              data.liked = JSON.parse(cachedLikes).liked;
            } else {
              const [likes] = await ctx.db
                .select()
                .from(lovedTracks)
                .leftJoin(tracks, eq(lovedTracks.trackId, tracks.id))
                .leftJoin(users, eq(lovedTracks.userId, users.id))
                .where(and(eq(users.did, did), eq(tracks.sha256, sha256)))
                .execute();
              data.liked = likes ? true : false;
              await ctx.redis.setEx(
                `likes:${did}:${sha256}`,
                2,
                JSON.stringify({ liked: data.liked }),
              );
            }

            // Track metadata — also capture duration_ms from DB (stored in ms)
            let durationMs: number = data.duration_ms ?? data.duration ?? 0;
            if (cachedTrack) {
              const cachedData = JSON.parse(cachedTrack);
              data.album_art = cachedData.albumArt;
              data.song_uri = cachedData.uri;
              data.album_uri = cachedData.albumUri;
              data.artist_uri = cachedData.artistUri;
              if (cachedData.duration) durationMs = cachedData.duration;
              await ctx.redis.setEx(
                `nowplaying:${did}`,
                3,
                JSON.stringify({ ...data, sha256, liked: data.liked }),
              );
            } else {
              const [track] = await ctx.db
                .select()
                .from(tracks)
                .where(eq(tracks.sha256, sha256))
                .execute();
              if (track) {
                data.album_art = track.albumArt;
                data.song_uri = track.uri;
                data.album_uri = track.albumUri;
                data.artist_uri = track.artistUri;
                if (track.duration) durationMs = track.duration;
                await Promise.all([
                  ctx.redis.setEx(
                    `track:${sha256}`,
                    10,
                    JSON.stringify({
                      albumArt: track.albumArt,
                      uri: track.uri,
                      albumUri: track.albumUri,
                      artistUri: track.artistUri,
                      duration: track.duration,
                      liked: data.liked,
                    }),
                  ),
                  ctx.redis.setEx(
                    `nowplaying:${did}`,
                    3,
                    JSON.stringify({ ...data, sha256, liked: data.liked }),
                  ),
                ]);
              }
            }

            // Emit song.changed only when the track differs AND the player is
            // not paused/stopped. If stopped:did is set, Rockbox sent status=0
            // and is not actively playing — suppress all status updates so a
            // paused Rockbox cannot overwrite a status set by Navidrome or
            // another active source. status=1 (or a genuinely new track start)
            // clears the flag and re-enables updates.
            const lastSongKey = `lastsong:${did}`;
            const lastSongSha256 = await ctx.redis.get(lastSongKey);
            const trackChanged = lastSongSha256 !== sha256;

            if (trackChanged) {
              const isStopped = !!(await ctx.redis.get(`stopped:${did}`));
              if (isStopped) {
                consola.debug(
                  `[ws] skip song.changed for ${did}: player is stopped/paused (${data.title})`,
                );
              } else {
                const pendingTimer = pendingStop.get(did);
                if (pendingTimer) {
                  clearTimeout(pendingTimer);
                  pendingStop.delete(did);
                }
                await ctx.redis.setEx(lastSongKey, 86400, sha256); // 24h TTL
                await ctx.redis.setEx(`ws_lastsong:${did}`, 86400, sha256);

                const source =
                  deviceNames[ws.deviceId] ??
                  deviceNames[device_id] ??
                  "websocket";
                consola.info(
                  `[ws] song.changed for ${did}: ${data.title} – ${data.artist} (source: ${source})`,
                );
                ctx.nc.publish(
                  "rocksky.song.changed",
                  Buffer.from(
                    JSON.stringify({
                      did,
                      track: {
                        name: data.title,
                        artist: data.artist,
                        album: data.album,
                        albumCoverUrl: data.album_art ?? undefined,
                        duration_ms: durationMs,
                        source,
                      },
                    }),
                  ),
                );
              }
            } else {
              consola.debug(
                `[ws] skip song.changed for ${did}: same track ${data.title} (sha256 match)`,
              );
            }
          } else {
            await ctx.redis.setEx(
              `nowplaying:${did}:status`,
              3,
              `${data.status}`,
            );

            // Emit song.stopped only if this websocket was the active playback
            // source (ws_lastsong key set). This prevents Rockbox idle status=0
            // from clearing a status that was written by Navidrome or another source.
            const wsLastSongKey = `ws_lastsong:${did}`;
            const wsWasPlaying = (await ctx.redis.exists(wsLastSongKey)) > 0;
            if (data.status === 0 && wsWasPlaying) {
              // Do NOT delete ws_lastsong here — only delete it when the debounce
              // timer fires. If status=1 arrives within 15s the timer is cancelled
              // and ws_lastsong remains intact, so future status=0 events can still
              // gate song.stopped. Deleting it eagerly broke the gate after the
              // first pause/resume cycle.
              await ctx.redis.setEx(`stopped:${did}`, 86400, "1");
              // Debounce: only publish song.stopped after 15s of continuous stop.
              // A status=0/status=1 oscillation (common with paused Rockbox) would
              // otherwise create a rapid PDS delete→create loop.
              const existing = pendingStop.get(did);
              if (existing) clearTimeout(existing);
              const timer = setTimeout(async () => {
                pendingStop.delete(did);
                await ctx.redis.del(wsLastSongKey);
                ctx.nc.publish(
                  "rocksky.song.stopped",
                  Buffer.from(JSON.stringify({ did })),
                );
              }, 15_000);
              pendingStop.set(did, timer);
            }
            if (data.status === 1) {
              const pendingTimer = pendingStop.get(did);
              if (pendingTimer) {
                // Cancelled before firing — song.stopped was never published so
                // the PDS record still exists. ws_lastsong is still set (we didn't
                // delete it eagerly), so future status=0 events remain gated.
                clearTimeout(pendingTimer);
                pendingStop.delete(did);
                await ctx.redis.del(`stopped:${did}`);
              } else {
                // No pending timer — song.stopped may have already fired (player
                // was stopped for >15s). Clear lastsong so the next heartbeat
                // re-publishes song.changed and restores the PDS record.
                const wasStopped = await ctx.redis.get(`stopped:${did}`);
                if (wasStopped) {
                  await ctx.redis.del(`stopped:${did}`);
                  await ctx.redis.del(`lastsong:${did}`);
                }
              }
            }
          }

          // ── Broadcast enriched data to all connected devices ──
          userDevices[did]?.forEach((id) => {
            const targetDevice = devices[id];
            if (targetDevice) {
              targetDevice.send(
                JSON.stringify({ type: "message", data, device_id }),
              );
            }
          });
        }

        if (controlMessage.success) {
          const { type, target, action, args, token } = controlMessage.data;
          const { did } = jwt.verify(token, env.JWT_SECRET, {
            ignoreExpiration: true,
          });
          consola.info(
            `Control message: ${chalk.greenBright(type)}, ${chalk.greenBright(target)}, ${chalk.greenBright(action)}, ${chalk.greenBright(args)}, ${chalk.greenBright("***")}`,
          );
          // Handle control message
          const deviceId = userDevices[did]?.find((id) => id === target);
          if (deviceId) {
            const targetDevice = devices[deviceId];
            if (targetDevice) {
              targetDevice.send(JSON.stringify({ type, action, args }));
              consola.info(
                `Control message sent to device: ${chalk.greenBright(deviceId)}, ${chalk.greenBright(target)}`,
              );
              return;
            }
            consola.error(`Device not found: ${target}`);
            return;
          }
          userDevices[did]?.forEach((id) => {
            const targetDevice = devices[id];
            if (targetDevice) {
              targetDevice.send(JSON.stringify({ type, action, args }));
              consola.info(
                `Control message sent to all devices: ${chalk.greenBright(id)}, ${chalk.greenBright(target)}`,
              );
            }
          });

          consola.error(`Device ID not found for target: ${target}`);
          return;
        }

        if (registerMessage.success) {
          const { type, clientName, token } = registerMessage.data;
          consola.info(
            `Register message: ${chalk.greenBright(type)}, ${chalk.greenBright(clientName)}, ${chalk.greenBright("****")}`,
          );
          // Handle register Message
          const { did } = jwt.verify(token, env.JWT_SECRET, {
            ignoreExpiration: true,
          });
          const deviceId = uuidv4();
          ws.deviceId = deviceId;
          ws.did = did;
          devices[deviceId] = ws;
          deviceNames[deviceId] = clientName;
          userDevices[did] = [...(userDevices[did] || []), deviceId];
          consola.info(
            `Device registered: ${chalk.greenBright(deviceId)}, ${chalk.greenBright(clientName)}`,
          );

          // broadcast to all devices
          userDevices[did]
            .filter((id) => id !== deviceId)
            .forEach((id) => {
              const targetDevice = devices[id];
              if (targetDevice) {
                targetDevice.send(
                  JSON.stringify({
                    type: "device_registered",
                    deviceId,
                    clientName,
                  }),
                );
              }
            });

          ws.send(JSON.stringify({ status: "registered", deviceId }));
          return;
        }
      } catch (e) {
        consola.error("Error parsing message:", e);
      }
    },
    onClose: (_, ws) => {
      consola.info("Connection closed");
      // remove device from devices
      const deviceId = ws.deviceId;
      const did = ws.did;
      if (deviceId && devices[deviceId]) {
        delete devices[deviceId];
        consola.info(`Device removed: ${chalk.redBright(deviceId)}`);
      }
      if (did && userDevices[did]) {
        userDevices[did] = userDevices[did].filter((id) => id !== deviceId);
        if (userDevices[did].length === 0) {
          delete userDevices[did];
        }
      }
      if (deviceId && deviceNames[deviceId]) {
        const clientName = deviceNames[deviceId];
        delete deviceNames[deviceId];
        consola.info(
          `Device name removed: ${chalk.redBright(deviceId)}, ${chalk.redBright(clientName)}`,
        );
      }
    },
  };
}

export default handleWebsocket;
