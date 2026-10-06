// Public certificate fingerprints only; never put a keystore or private key here.
const LOCAL_RELEASE_SHA256 =
  "6D:87:91:43:C4:24:41:00:32:2E:F3:6E:91:9F:40:2C:DD:41:65:C6:9E:E2:49:03:0D:8C:0C:F7:13:36:76:54";
export type AppLinkEnvironment = {
  ANDROID_PLAY_SIGNING_SHA256?: string;
  APPLE_TEAM_ID?: string;
};
export function appLinkResponse(
  path: string,
  env: AppLinkEnvironment,
): Response | undefined {
  const headers = { "Cache-Control": "public, max-age=3600" };
  if (path === "/.well-known/assetlinks.json") {
    const fingerprints = [
      LOCAL_RELEASE_SHA256,
      ...(env.ANDROID_PLAY_SIGNING_SHA256 ?? "")
        .split(",")
        .map((value) => value.trim().toUpperCase()),
    ].filter((value) => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
    return Response.json(
      [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "app.rocksky",
            sha256_cert_fingerprints: [...new Set(fingerprints)],
          },
        },
      ],
      { headers },
    );
  }
  if (path === "/.well-known/apple-app-site-association") {
    const team = env.APPLE_TEAM_ID;
    const details =
      team && /^[A-Z0-9]{10}$/.test(team)
        ? [
            {
              appID: `${team}.app.rocksky`,
              paths: [
                "/profile/*",
                "/*/song/*",
                "/*/track/*",
                "/*/album/*",
                "/*/artist/*",
                "/*/scrobble/*",
              ],
            },
          ]
        : [];
    return Response.json({ applinks: { apps: [], details } }, { headers });
  }
}
