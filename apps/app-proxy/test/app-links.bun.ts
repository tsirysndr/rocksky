import { expect, test } from "bun:test";
import { appLinkResponse } from "../src/app-links";
import worker from "../src/index";

test("serves release certificate directly without upstream redirects", async () => {
  const response = await worker.fetch(
    new Request("https://rocksky.app/.well-known/assetlinks.json"),
    {} as Env,
    {} as ExecutionContext,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/json");
  const data = (await response.json()) as any[];
  expect(data[0].target.package_name).toBe("app.rocksky");
  expect(data[0].target.sha256_cert_fingerprints).toHaveLength(1);
});
test("accepts additional Play signing certificates and ignores invalid values", async () => {
  const fingerprint = Array(32).fill("AB").join(":");
  const response = appLinkResponse("/.well-known/assetlinks.json", {
    ANDROID_PLAY_SIGNING_SHA256: `${fingerprint},invalid,${fingerprint}`,
  })!;
  const data = (await response.json()) as any[];
  expect(data[0].target.sha256_cert_fingerprints).toHaveLength(2);
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
