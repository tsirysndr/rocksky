const INSTALLER_URL =
  "https://raw.githubusercontent.com/tsirysndr/rocksky/main/install.sh";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    try {
      // Always fetch the fixed script; incoming paths, queries and credentials
      // are not forwarded to GitHub. Preserve the upstream body and status.
      return await fetch(INSTALLER_URL, { method: request.method });
    } catch {
      return new Response("Unable to fetch the Rocksky installer\n", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  },
};
