import chalk from "chalk";
import { ctx } from "context";
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { Context } from "hono";
import jwt from "jsonwebtoken";
import { env } from "lib/env";
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
          const { did } = jwt.verify(token, env.JWT_SECRET);
          // broadcast to all devices
          userDevices[did].forEach(async (id) => {
            const targetDevice = devices[id];
            if (targetDevice) {
              if (data.album) {
                const sha256 = createHash("sha256")
                  .update(
                    `${data.title} - ${data.artist} - ${data.album}`.toLowerCase()
                  )
                  .digest("hex");
                const [cachedTrack, cachedLikes] = await Promise.all([
                  ctx.redis.get(`track:${sha256}`),
                  ctx.redis.get(`likes:${did}:${sha256}`),
                ]);

                if (cachedLikes) {
                  const cachedData = JSON.parse(cachedLikes);
                  data.liked = cachedData.liked;
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
                    JSON.stringify({ liked: data.liked })
                  );
                }

                if (cachedTrack) {
                  const cachedData = JSON.parse(cachedTrack);
                  data.album_art = cachedData.albumArt;
                  data.song_uri = cachedData.uri;
                  data.album_uri = cachedData.albumUri;
                  data.artist_uri = cachedData.artistUri;
                  await ctx.redis.setEx(`nowplaying:${did}`, 3, {
                    ...data,
                    sha256,
                    liked: data.liked,
                  });
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
                        })
                      ),
                      ctx.redis.setEx(
                        `nowplaying:${did}`,
                        3,
                        JSON.stringify({
                          ...data,
                          sha256,
                          liked: data.liked,
                        })
                      ),
                    ]);
                  }
                }
              }

              targetDevice.send(
                JSON.stringify({
                  type: "message",
                  data,
                  device_id,
                })
              );
            }
          });
        }

        if (controlMessage.success) {
          const { type, target, action, args, token } = controlMessage.data;
          const { did } = jwt.verify(token, env.JWT_SECRET);
          console.log(
            `Control message: ${chalk.greenBright(type)}, ${chalk.greenBright(target)}, ${chalk.greenBright(action)}, ${chalk.greenBright(args)}, ${chalk.greenBright("***")}`
          );
          // Handle control message
          const deviceId = userDevices[did]?.find((id) => id === target);
          if (deviceId) {
            const targetDevice = devices[deviceId];
            if (targetDevice) {
              targetDevice.send(JSON.stringify({ type, action, args }));
              console.log(
                `Control message sent to device: ${chalk.greenBright(deviceId)}, ${chalk.greenBright(target)}`
              );
              return;
            }
            console.error(`Device not found: ${target}`);
            return;
          }
          userDevices[did]?.forEach((id) => {
            const targetDevice = devices[id];
            if (targetDevice) {
              targetDevice.send(JSON.stringify({ type, action, args }));
              console.log(
                `Control message sent to all devices: ${chalk.greenBright(id)}, ${chalk.greenBright(target)}`
              );
            }
          });

          console.error(`Device ID not found for target: ${target}`);
          return;
        }

        if (registerMessage.success) {
          const { type, clientName, token } = registerMessage.data;
          console.log(
            `Register message: ${chalk.greenBright(type)}, ${chalk.greenBright(clientName)}, ${chalk.greenBright("****")}`
          );
          // Handle register Message
          const { did } = jwt.verify(token, env.JWT_SECRET);
          const deviceId = uuidv4();
          ws.deviceId = deviceId;
          ws.did = did;
          devices[deviceId] = ws;
          deviceNames[deviceId] = clientName;
          userDevices[did] = [...(userDevices[did] || []), deviceId];
          console.log(
            `Device registered: ${chalk.greenBright(deviceId)}, ${chalk.greenBright(clientName)}`
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
                  })
                );
              }
            });

          ws.send(JSON.stringify({ status: "registered", deviceId }));
          return;
        }
      } catch (e) {
        console.error("Error parsing message:", e);
      }
    },
    onClose: (_, ws) => {
      console.log("Connection closed");
      // remove device from devices
      const deviceId = ws.deviceId;
      const did = ws.did;
      if (deviceId && devices[deviceId]) {
        delete devices[deviceId];
        console.log(`Device removed: ${chalk.redBright(deviceId)}`);
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
        console.log(
          `Device name removed: ${chalk.redBright(deviceId)}, ${chalk.redBright(clientName)}`
        );
      }
    },
  };
}

export default handleWebsocket;
