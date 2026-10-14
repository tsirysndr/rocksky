/** Include the SDK's XRPC code and HTTP status alongside its explanation. */
export function formatImportError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const e = error as { message?: string; kind?: string; status?: number };
  const details = [e.kind, e.status ? `HTTP ${e.status}` : undefined].filter(Boolean);
  return `${e.message || "Unknown import error"}${details.length ? ` [${details.join(", ")}]` : ""}`;
}
