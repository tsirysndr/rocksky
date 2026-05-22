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

            // Read previous now-playing alongside track/like caches so we
            // can detect a track change before overwriting the key.
            const [cachedTrack, cachedLikes, previousNowPlaying] =
              await Promise.all([
                ctx.redis.get(`track:${sha256}`),
                ctx.redis.get(`likes:${did}:${sha256}`),
                ctx.redis.get(`nowplaying:${did}`),
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

            // Track metadata
            if (cachedTrack) {
              const cachedData = JSON.parse(cachedTrack);
              data.album_art = cachedData.albumArt;
              data.song_uri = cachedData.uri;
              data.album_uri = cachedData.albumUri;
              data.artist_uri = cachedData.artistUri;
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
                await Promise.all([
                  ctx.redis.setEx(
                    `track:${sha256}`,
                    10,
                    JSON.stringify({
                      albumArt: track.albumArt,
                      uri: track.uri,
                      albumUri: track.albumUri,
                      artistUri: track.artistUri,
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

            // Emit song.changed only when the track actually differs from
            // the previous one (different sha256 or no previous state).
            const previousSha256 = previousNowPlaying
              ? JSON.parse(previousNowPlaying).sha256
              : null;

            if (previousSha256 !== sha256) {
              const source = deviceNames[device_id] ?? "websocket";
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
                      duration_ms: data.duration_ms ?? data.duration,
                      source,
                    },
                  }),
                ),
              );
            }
          } else {
            await ctx.redis.setEx(
              `nowplaying:${did}:status`,
              3,
              `${data.status}`,
            );

            // Emit song.stopped when the player explicitly reports not playing.
            if (String(data.status) !== "1") {
              ctx.nc.publish(
                "rocksky.song.stopped",
                Buffer.from(JSON.stringify({ did })),
              );
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
