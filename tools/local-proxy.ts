const PORT = parseInt(Deno.env.get("PORT") || "8081");

console.log(`HTTP Proxy Server is running on http://localhost:${PORT}`);

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  try {
    let target: URL;

    if (
      url.pathname.startsWith("/xrpc") ||
      url.pathname.startsWith("/login") ||
      url.pathname.startsWith("/oauth/callback") ||
      url.pathname.startsWith("/users") ||
      url.pathname.startsWith("/albums") ||
      url.pathname.startsWith("/artists") ||
      url.pathname.startsWith("/tracks") ||
      url.pathname.startsWith("/scrobbles") ||
      url.pathname.startsWith("/likes") ||
      url.pathname.startsWith("/spotify") ||
      url.pathname.startsWith("/dropbox/oauth/callback") ||
      url.pathname.startsWith("/googledrive/oauth/callback") ||
      url.pathname.startsWith("/dropbox/files") ||
      url.pathname.startsWith("/dropbox/file") ||
      url.pathname.startsWith("/googledrive/files") ||
      url.pathname.startsWith("/dropbox/login") ||
      url.pathname.startsWith("/googledrive/login") ||
      url.pathname.startsWith("/dropbox/join") ||
      url.pathname.startsWith("/googledrive/join") ||
      url.pathname.startsWith("/search") ||
      url.pathname.startsWith("/public/scrobbles")
    ) {
      // API requests
      target = new URL(url);
      target.host = "localhost";
      target.port = "4004";
    } else {
      // Vite frontend requests
      target = new URL(url);
      target.host = "localhost";
      target.port = "5174";
    }

    // Handle WebSocket connections
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Deno.upgradeWebSocket(req);
      const wsUrl = `ws://${target.host}${target.pathname}${target.search}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connection established");
      };
      ws.onmessage = (event) => {
        socket.send(event.data);
      };
      ws.onclose = () => {
        socket.close();
      };
      ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        socket.close();
      };
      socket.onmessage = (event) => {
        ws.send(event.data);
      };
      socket.onclose = () => {
        ws.close();
      };
      return response;
    }

    // Proxy HTTP requests
    const proxyRequest = new Request(target.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });

    const response = await fetch(proxyRequest);

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response("Failed to fetch the target URL", { status: 500 });
  }
});
