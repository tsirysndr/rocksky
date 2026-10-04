import axios from "axios";

export type UploadFailure = {
  message: string;
  missingFields: string[];
  hint?: string;
  retryable: boolean;
  skipped: boolean;
};

const fileErrors: Record<string, [string, string]> = {
  NO_FILE: ["No file was received.", "Choose the file again."],
  INVALID_FORMAT: [
    "Unsupported audio format.",
    "Choose an MP3, FLAC, M4A, OGG, WAV, or AIFF file.",
  ],
  METADATA_PARSE_FAILED: [
    "Could not read audio tags from this file.",
    "Check that the file plays correctly, repair its tags, then choose it again.",
  ],
  NO_TAGS: [
    "No audio tags found in this file.",
    "Add title, artist, album, and album art with a tag editor, then choose the saved file again.",
  ],
  INCOMPLETE_METADATA: [
    "Missing or invalid audio metadata.",
    "Correct the tags with a tag editor, then choose the saved file again.",
  ],
};

export function describeUploadError(error: unknown): UploadFailure {
  const failure = (
    message: string,
    retryable = true,
    hint?: string,
  ): UploadFailure => ({
    message,
    retryable,
    hint,
    skipped: false,
    missingFields: [],
  });
  if (axios.isCancel(error)) return failure("Upload canceled.");
  if (!axios.isAxiosError(error)) {
    return failure(
      error instanceof Error ? error.message : "Could not upload this file.",
    );
  }
  const status = error.response?.status;
  const data = error.response?.data;
  const body = data && typeof data === "object" ? data : {};
  const code = typeof body.error === "string" ? body.error : "";
  // Do not display an HTML error page returned by a proxy as the reason.
  const serverMessage =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : typeof data === "string" && data.trim() && !/<[^>]+>/.test(data)
        ? data.trim()
        : undefined;
  const missingFields = Array.isArray(body.missingFields)
    ? body.missingFields.filter(
        (field: unknown): field is string =>
          typeof field === "string" && !!field.trim(),
      )
    : [];
  if (code === "DUPLICATE_FILE") {
    return {
      ...failure(
        serverMessage ?? "This exact file is already in your library.",
        false,
      ),
      skipped: true,
    };
  }
  if (fileErrors[code] || missingFields.length) {
    const [message, hint] = fileErrors[code] ?? fileErrors.INCOMPLETE_METADATA;
    return { ...failure(serverMessage ?? message, false, hint), missingFields };
  }
  if (!status) {
    return failure(
      error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
        ? "The upload timed out. Check your connection and retry."
        : "Could not reach the upload server. Check your connection and retry.",
    );
  }
  const fallback: Record<number, string> = {
    401: "Your session has expired. Sign in again to upload.",
    403: "You do not have permission to upload this file.",
    413: "This file exceeds the server's upload size limit.",
    415: "This audio format is not supported.",
    422: "The server could not process this file. Check its audio data and metadata.",
    429: "Too many uploads. Wait a moment before retrying.",
    507: "There is not enough storage available for this upload.",
  };
  return failure(
    serverMessage ??
      fallback[status] ??
      (code || `Upload failed (HTTP ${status}).`),
    status === 408 || status === 429 || (status >= 500 && status !== 507),
  );
}
