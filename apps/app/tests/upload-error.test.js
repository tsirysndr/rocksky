import { expect, test } from "bun:test";
import { AxiosError } from "axios";
import { describeUploadError } from "../src/lib/uploadError";

const responseError = (status, data) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    { status, data },
  );

test("duplicate files are skipped rather than offered a retry", () => {
  const result = describeUploadError(
    responseError(409, {
      error: "DUPLICATE_FILE",
      message: "This exact file is already in your library",
    }),
  );
  expect(result.skipped).toBe(true);
  expect(result.retryable).toBe(false);
  expect(result.message).toBe("This exact file is already in your library");
  expect(
    describeUploadError(responseError(409, { message: "Another conflict" }))
      .skipped,
  ).toBe(false);
});

test("metadata rejection preserves precise field validation and corrective guidance", () => {
  const result = describeUploadError(
    responseError(422, {
      error: "INCOMPLETE_METADATA",
      message: "Please tag your file before uploading.",
      missingFields: ["album art", "title (too long, max 512 chars)", null, 4],
    }),
  );
  expect(result.message).toBe("Please tag your file before uploading.");
  expect(result.missingFields).toEqual([
    "album art",
    "title (too long, max 512 chars)",
  ]);
  expect(result.hint).toContain("choose the saved file again");
  expect(result.retryable).toBe(false);
});

test("known invalid files explain why they must be repaired or replaced", () => {
  for (const error of [
    "NO_FILE",
    "INVALID_FORMAT",
    "NO_TAGS",
    "METADATA_PARSE_FAILED",
  ]) {
    const result = describeUploadError(responseError(422, { error }));
    expect(result.message.length).toBeGreaterThan(10);
    expect(result.hint).toBeTruthy();
    expect(result.retryable).toBe(false);
  }
});

test("network and temporary server errors allow retry with useful reasons", () => {
  expect(
    describeUploadError(new AxiosError("Network Error", "ERR_NETWORK")).message,
  ).toContain("connection");
  expect(
    describeUploadError(new AxiosError("timeout", "ECONNABORTED")).message,
  ).toContain("timed out");
  const result = describeUploadError(
    responseError(503, { message: "Storage is temporarily unavailable" }),
  );
  expect(result.message).toBe("Storage is temporarily unavailable");
  expect(result.retryable).toBe(true);
  expect(describeUploadError(responseError(429, {})).retryable).toBe(true);
});

test("proxy HTML and empty bodies fall back to actionable HTTP errors", () => {
  expect(
    describeUploadError(responseError(413, "<html>nginx</html>")).message,
  ).toContain("size limit");
  expect(describeUploadError(responseError(401, {})).message).toContain(
    "Sign in again",
  );
  expect(
    describeUploadError(responseError(400, "Invalid multipart form data"))
      .message,
  ).toBe("Invalid multipart form data");
  expect(describeUploadError(responseError(500, null)).message).toBe(
    "Upload failed (HTTP 500).",
  );
});
