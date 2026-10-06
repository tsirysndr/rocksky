# Sharing and deep links

Profile, song/scrobble, album and artist detail screens open a common card composer.
It exports a 1080×1920 story or 1080×1080 square PNG, offers three themes and falls
back to an icon when artwork is unavailable. The system image share sheet exposes
compatible installed applications, including story targets when offered by the
receiving app. Text/link sharing uses the system sheet; Facebook, X and Bluesky
also have web composer shortcuts. Nothing is posted automatically.

Sharing a card copies its canonical HTTPS URL so the user can attach a link sticker
to a story. The image itself is not a clickable link. Native sharing and view capture
require a fresh native app build after installing the new dependencies.

Wrapped is available from the profile's **Wrapped** button. It queries the selected
calendar year's scrobbles, top artists and tracks for that profile; the current year
is explicitly a year-to-date recap. Failed requests show a retry action and empty
years never produce fabricated statistics. The shared URL includes `?wrapped=YEAR`;
the mobile app opens that recap, while existing web clients fall back to the profile.

## Link formats

- `https://rocksky.app/profile/{did-or-handle}`
- `https://rocksky.app/{did}/song/{rkey}` (`track` is also accepted by the app)
- `https://rocksky.app/{did}/album/{rkey}`
- `https://rocksky.app/{did}/artist/{rkey}`
- `https://rocksky.app/{did}/scrobble/{rkey}`
- `https://rocksky.app/profile/{did-or-handle}?wrapped=2025`

The same paths work under `rocksky://` (or `rocksky-test://` for the test variant).
Links are handled both at startup and while the app is open. Navigation retains the
Home stack, bottom tabs and mini player. Malformed and unsupported paths are ignored.

## Verified HTTPS links

The Expo config declares Android App Links and iOS Associated Domains for
`rocksky.app`. Deploy **apps/app-proxy** to serve the association responses at
`/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association`.

Android includes the **public fingerprint** of the existing local release certificate.
If Play App Signing uses another certificate, add its SHA-256 fingerprint to the
Worker's `ANDROID_PLAY_SIGNING_SHA256` variable (comma-separated for rotated keys).
Find it in Play Console → Test and release → Setup → App signing → App signing key
certificate. This is public metadata; never publish the keystore or its passwords.

For iOS, configure the Worker's `APPLE_TEAM_ID` with the 10-character Apple developer
team ID for `app.rocksky` and build with that team's provisioning profile. Until it
is provided, the Apple association file intentionally has no claimed app IDs.
The test variant does not claim the production HTTPS domain.

## Checks

From the repository root:

```
node --experimental-strip-types --test apps/app/tests/share-links.test.js
bun test ./apps/app-proxy/test/app-links.bun.ts ./apps/app-proxy/test/deep-links.bun.ts
```

On a rebuilt Android app, test cold and warm opens with a real URI:

```
adb shell am start -a android.intent.action.VIEW -d 'rocksky://profile/YOUR_HANDLE'
adb shell pm verify-app-links --re-verify app.rocksky
adb shell pm get-app-links app.rocksky
```

On device, check that profile tabs remain below the compact identity bar while
scrolling, switching tabs, and refreshing. Preview both card formats with long
names and missing artwork, share to an installed app, and cancel its composer.
Check Wrapped for the current year, a completed year, an empty year, and a failed
network request. OS target availability and story placement are controlled by the
receiving app and require real-device verification.
