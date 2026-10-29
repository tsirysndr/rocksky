import type { NotificationView } from "../api/notifications";

export const browserNotificationsSupported = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "Notification" in window &&
  "serviceWorker" in navigator;

export async function enableBrowserNotifications() {
  // Call directly from a click; browsers require a user gesture.
  const permission = await Notification.requestPermission();
  if (permission === "granted") await notificationWorker();
  return permission;
}

async function notificationWorker() {
  const registration = await navigator.serviceWorker.register(
    "/notification-worker.js",
    { scope: "/notifications/" },
  );
  if (registration.active) return registration;
  const worker = registration.installing || registration.waiting;
  if (!worker) throw new Error("Notification worker unavailable");
  await new Promise<void>((resolve, reject) => {
    const changed = () => {
      if (worker.state === "activated" || worker.state === "redundant") {
        worker.removeEventListener("statechange", changed);
        if (worker.state === "activated") resolve();
        else reject(new Error("Notification worker failed"));
      }
    };
    worker.addEventListener("statechange", changed);
    changed();
  });
  return registration;
}

export async function showBrowserNotification(
  n: NotificationView,
  auth: string,
) {
  if (
    !browserNotificationsSupported() ||
    Notification.permission !== "granted" ||
    !n?.id ||
    n.read
  )
    return;
  // Keep alerts out of the way while the user is viewing the site.
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const registration = await notificationWorker();
  if (localStorage.getItem("token") !== auth) return;
  const verbs: Record<string, string> = {
    like_scrobble: "liked your scrobble",
    follow: "followed you",
    comment_scrobble: "commented on your scrobble",
    comment_profile: "commented on your profile",
    reply: "replied to your comment",
    react_comment: "reacted to your comment",
    mention: "mentioned you",
  };
  const name = n.actor?.displayName || n.actor?.handle || "Someone";
  const parts =
    /^at:\/\/([^/]+)\/app\.rocksky\.(scrobble|song|album|artist)\/([^/]+)$/.exec(
      n.subjectUri || "",
    );
  const path = parts
    ? `/${encodeURIComponent(parts[1])}/${parts[2]}/${encodeURIComponent(parts[3])}`
    : `/profile/${encodeURIComponent(n.actor?.did || n.actor?.handle || "")}`;
  await registration.showNotification("Rocksky", {
    body: `${name} ${verbs[n.type] || "sent you a notification"}`,
    tag: `rocksky-${n.id}`,
    data: { path },
  });
}
