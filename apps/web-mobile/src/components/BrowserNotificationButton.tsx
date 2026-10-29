import { useState } from "react";
import {
  browserNotificationsSupported,
  enableBrowserNotifications,
} from "../lib/browserNotifications";

export default function BrowserNotificationButton() {
  const supported = browserNotificationsSupported();
  const [permission, setPermission] = useState(
    supported ? Notification.permission : "default",
  );
  const [error, setError] = useState(false);
  if (!supported) return null;
  return (
    <div
      style={{ padding: "8px 16px", fontSize: 13, color: "var(--color-text)" }}
    >
      {permission === "denied" ? (
        <span>
          Notifications blocked. Enable them in your browser’s site settings.
        </span>
      ) : (
        <button
          type="button"
          disabled={permission === "granted"}
          onClick={() => {
            setError(false);
            void enableBrowserNotifications()
              .then(setPermission)
              .catch(() => setError(true));
          }}
          style={{
            color: "var(--color-text)",
            background: "transparent",
            border: 0,
            boxShadow: "none",
            appearance: "none",
            fontFamily: "inherit",
            fontSize: "inherit",
            lineHeight: 1.5,
            textAlign: "left",
            opacity: 1,
            cursor: permission === "granted" ? "default" : "pointer",
            padding: "6px 0",
          }}
        >
          {permission === "granted"
            ? "Browser notifications enabled"
            : "Enable browser notifications"}
        </button>
      )}
      {error && (
        <span role="alert">Could not enable notifications. Try again.</span>
      )}
    </div>
  );
}
