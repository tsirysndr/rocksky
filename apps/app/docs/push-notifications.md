# Android and browser notifications

Gleam, TypeScript (`apps/api`) and PureScript backends expose the same device endpoints and FCM payloads. TypeScript and PureScript use the migration in `apps/api/drizzle`; Gleam keeps an identical migration in its own directory. They share the same database table and environment settings.

Android uses the native FCM token from `expo-notifications`; the Gleam backend sends directly through Firebase Admin. Expo Push Service and EAS FCM private-key uploads are not used.

## Backend deployment

1. Install dependencies from the repository root with `bun install`.
2. In `gleam`, run `bun run db:migrate`, then `gleam build`.
3. Set these variables for **both** Gleam REST and XRPC services (notifications originate from either):
   - `FCM_ENABLED=true`
   - `FIREBASE_PROJECT_ID=rocksky-2caf4`
   - `GOOGLE_APPLICATION_CREDENTIALS=/etc/rocksky/secrets/firebase-admin.json`
4. Keep the service-account JSON readable only by the service user. Enable the Firebase Cloud Messaging HTTP v1 API for the project. Restart both services after deployment.

The authenticated REST endpoints are `POST /notifications/devices` and `POST /notifications/devices/remove`, each accepting `{ "token": "native FCM token" }`. Ownership comes from the bearer token. Device registration refreshes on foreground entry; logout removes the registration before clearing authentication. If removal fails, logout reports an error and can be retried. Invalid provider tokens are removed, and registrations older than 90 days are ignored.

Delivery is best effort: provider failures are logged, without rolling back social actions. There is no durable delivery queue or replay on provider failure. The existing notification inbox remains the source of truth.

## Android builds

The Firebase Android app must use package `app.rocksky`. Provide its `google-services.json` locally or set `GOOGLE_SERVICES_JSON` to an EAS file environment variable path. The JSON is ignored by Git, so remote EAS builds need that file variable. Never use the Admin service-account JSON for this variable.

Run `bunx expo prebuild --platform android --no-install`, then build a development or release app. Expo Go cannot receive these Android pushes. Test builds use package `app.rocksky.test`; to test FCM there, register a separate Android app in the same Firebase project and supply its matching configuration via `GOOGLE_SERVICES_JSON`.

On sign-in, the app creates the Social notifications channel and requests Android notification permission. Tapping a notification opens Alerts. Existing builds must be rebuilt to include the native module. SHA fingerprints are not required for FCM alone.

## Browsers

Both web clients expose **Enable browser notifications** in their notifications UI. Permission is requested only on a click. HTTPS (or localhost), Notifications API and service workers are required. Alerts use the existing authenticated SSE stream and a service worker for OS notification presentation, including compatible mobile browsers. The worker has the isolated `/notifications/` scope and does not intercept requests.

The website must remain open; this is not background Web Push after all tabs close. Alerts appear when the page is unfocused, and clicking opens the related content. Browser/OS restrictions may suppress alerts or suspend a background tab's SSE connection.

## Verification

- `cd gleam && gleam build && node --test test/push_notifications.test.mjs`
- Typecheck the Android app and both web clients.
- On a physical Android device, grant permission, trigger a follow/comment from another account, and verify foreground, background, cold-start tap, token refresh and logout behavior.
- On each web client, enable notifications, focus another window, trigger an event, and verify the system alert and its click destination.
