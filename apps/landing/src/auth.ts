export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function handleError(value: string): string | undefined {
  const handle = normalizeHandle(value);
  if (!handle) return "Enter your Atmosphere handle to continue.";
  const labels = handle.split(".");
  if (
    handle.length > 253 ||
    labels.length < 2 ||
    !labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    ) ||
    !/^[a-z]/.test(labels[labels.length - 1])
  ) {
    return "Use your full handle, like you.bsky.social or your own domain.";
  }
  return undefined;
}

// Start OAuth at the API directly, skipping the web app's /loading page.
// The API still owns authorization and the existing callback/session flow.
export function authGateway(apiUrl?: string, override?: string): string {
  return (
    override ||
    `${(apiUrl || "https://api.rocksky.app").replace(/\/$/, "")}/login`
  );
}

export function authUrl(gateway: string, handle?: string): string {
  const url = new URL(gateway);
  if (handle === undefined) {
    url.searchParams.delete("handle");
    url.searchParams.set("prompt", "create");
  } else {
    url.searchParams.delete("prompt");
    url.searchParams.set("handle", normalizeHandle(handle));
  }
  return url.toString();
}

export async function passwordSignIn(
  apiUrl: string,
  handle: string,
  password: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, "")}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: normalizeHandle(handle), password }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  } catch {
    throw new Error(
      "Couldn’t reach Rocksky. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Too many sign-in attempts. Please wait and try again."
        : "Couldn’t sign in. Check your handle and password and try again.",
    );
  }
  const body = (await response.text()).trim();
  const token = body.startsWith("jwt:") ? body.slice(4).trim() : "";
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Sign-in did not return a session. Please try again.");
  }
  return token;
}
