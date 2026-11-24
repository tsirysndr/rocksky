const INSTALLER_URL =
  "https://raw.githubusercontent.com/tsirysndr/rocksky/main/install.sh";
const PLAYERD_INSTALLER_URL =
  "https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    try {
      const path = new URL(request.url).pathname;
      const installer =
        path === "/playerd" || path === "/playerd/"
          ? PLAYERD_INSTALLER_URL
          : INSTALLER_URL;
      // Only fixed upstream URLs are allowed. Queries, headers and credentials
      // are not forwarded to GitHub. Preserve the upstream body and status.
      return await fetch(installer, { method: request.method });
    } catch {
      return new Response("Unable to fetch the Rocksky installer\n", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  },
};
