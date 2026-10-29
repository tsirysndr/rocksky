import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

async function saveDevice(db, user, token, remove) {
    if (remove) {
      await db.pool.query("DELETE FROM notification_devices WHERE token = $1 AND user_id = $2", [token, user]);
    } else {
      await db.pool.query(`INSERT INTO notification_devices (token, user_id) VALUES ($1, $2)
        ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()`, [token, user]);
    }

}

function messageFor(notification) {
  const actor = notification.actor?.displayName || notification.actor?.handle || "Someone";
  const verbs = {
    like_scrobble: "liked your scrobble", follow: "followed you",
    comment_scrobble: "commented on your scrobble", comment_profile: "commented on your profile",
    reply: "replied to your comment", react_comment: "reacted to your comment", mention: "mentioned you",
  };
  return {
    notification: { title: "Rocksky", body: `${actor} ${verbs[notification.type] || "sent you a notification"}`.slice(0, 240) },
    data: { body: JSON.stringify({ notificationId: notification.id, screen: "Alerts" }) },
    android: { priority: "high", notification: { channelId: "social", tag: notification.id, sound: "default" } },
  };
}

async function deliver(db, user, notification, messaging) {
  const { rows } = await db.pool.query(
    "SELECT token FROM notification_devices WHERE user_id = $1 AND updated_at > now() - interval '90 days'", [user]);
  for (let i = 0; i < rows.length; i += 500) {
    const tokens = rows.slice(i, i + 500).map(row => row.token);
    const result = await messaging.sendEachForMulticast({ ...messageFor(notification), tokens });
    const invalid = result.responses.flatMap((response, index) =>
      ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(response.error?.code)
        ? [tokens[index]] : []);
    if (invalid.length) await db.pool.query(
      "DELETE FROM notification_devices WHERE user_id = $1 AND token = ANY($2::text[])", [user, invalid]);
    if (result.failureCount) console.warn("FCM delivery failures:", result.failureCount);
  }
}

// Best effort delivery: a provider outage must never fail a social action.
function publish(db, user, payload) {
  if (process.env.FCM_ENABLED !== "true") return;
  void (async () => {
    const event = JSON.parse(payload);
    if (event.type !== "notification" || !event.notification?.id) return;
    const app = getApps().find(app => app.name === "rocksky-push") || initializeApp({
      credential: applicationDefault(),
      ...(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : {}),
    }, "rocksky-push");
    await deliver(db, user, event.notification, getMessaging(app));
  })().catch(error => console.warn("FCM delivery failed:", error.code || error.name));
}

export const saveDeviceImpl = pool => user => token => remove => () => saveDevice({pool}, user, token, remove);
export const publishImpl = pool => user => payload => () => publish({pool}, user, payload);
