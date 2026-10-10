import { expect, test } from "bun:test";
import { appLinkResponse } from "../src/app-links";
import worker from "../src/index";

test("serves release and Play signing certificates directly without upstream redirects", async () => {
  const response = await worker.fetch(
    new Request("https://rocksky.app/.well-known/assetlinks.json"),
    {} as Env,
    {} as ExecutionContext,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  const data = (await response.json()) as any[];
  expect(data[0].target.package_name).toBe("app.rocksky");
  expect(data[0].relation).toEqual([
    "delegate_permission/common.handle_all_urls",
    "delegate_permission/common.get_login_creds",
  ]);
  expect(data[0].target.sha256_cert_fingerprints).toEqual([
    "6D:87:91:43:C4:24:41:00:32:2E:F3:6E:91:9F:40:2C:DD:41:65:C6:9E:E2:49:03:0D:8C:0C:F7:13:36:76:54",
    "DD:B3:B5:D6:8E:F2:0B:09:86:58:BC:74:3A:B5:55:4B:81:BB:6A:68:D4:DB:F7:76:0D:A0:3A:23:7C:09:15:3B",
  ]);
});
test("accepts additional Play signing certificates and ignores invalid values", async () => {
  const fingerprint = Array(32).fill("AB").join(":");
  const response = appLinkResponse("/.well-known/assetlinks.json", {
    ANDROID_PLAY_SIGNING_SHA256: `${fingerprint},invalid,${fingerprint}`,
  })!;
  const data = (await response.json()) as any[];
  expect(data[0].target.sha256_cert_fingerprints).toHaveLength(3);
});
test("iOS associations use the configured team and restrict the supported routes", async () => {
  const response = appLinkResponse("/.well-known/apple-app-site-association", {
    APPLE_TEAM_ID: "ABCDE12345",
  })!;
  const data = (await response.json()) as any;
  expect(data.applinks.details[0].appID).toBe("ABCDE12345.app.rocksky");
  expect(data.applinks.details[0].paths).toContain("/*/scrobble/*");
  expect(data.applinks.details[0].paths).not.toContain("/*");
  expect(appLinkResponse("/oauth/callback", {})).toBeUndefined();
});

test("mobile site's static association matches production signing certificates", async () => {
  const mobile = await Bun.file(
    new URL("../../web-mobile/public/.well-known/assetlinks.json", import.meta.url),
  ).json();
  const canonical = await appLinkResponse("/.well-known/assetlinks.json", {})!.json();
  expect(mobile).toEqual(canonical);
});
