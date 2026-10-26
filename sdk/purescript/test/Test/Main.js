import { createServer } from "node:http";
import assert from "node:assert/strict";

export const startServer = (onError, onSuccess) => {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, "http://localhost");
    const nsid = url.pathname.split("/").at(-1);
    const send = (status, value) => { res.writeHead(status); res.end(value); };
    try {
      assert.equal(req.headers.authorization, "Bearer test-token");
      switch (nsid) {
        case "app.rocksky.actor.getProfile":
          assert.equal(req.method, "GET");
          assert.equal(url.searchParams.get("did"), "alice.test & music");
          return send(200, JSON.stringify({ did: "did:plc:alice", handle: "alice.test", extra: true }));
        case "app.rocksky.scrobble.createScrobble":
          assert.equal(req.method, "POST");
          assert.equal(req.headers["content-type"], "application/json");
          assert.deepEqual(JSON.parse(body), { title: "One More Time", artist: "Daft Punk", timestamp: 2200000000 });
          return send(200, JSON.stringify({ title: "One More Time", artist: "Daft Punk" }));
        case "app.rocksky.playlist.createPlaylist":
          assert.equal(req.method, "POST");
          assert.equal(body, "");
          assert.equal(req.headers["content-type"], undefined);
          assert.equal(url.searchParams.get("name"), "Favorites & more");
          assert.equal(url.searchParams.has("description"), false);
          return send(200, JSON.stringify({ uri: "at://did:plc:alice/app.rocksky.playlist/1", cid: "test-cid" }));
        case "app.rocksky.scrobble.getScrobbles":
          assert.equal(url.searchParams.get("following"), "false");
          assert.equal(url.searchParams.get("offset"), "0");
          assert.equal(url.searchParams.has("did"), false);
          return send(200, '{"scrobbles":[]}');
        case "test.api.denied": return send(401, '{"error":"AuthRequired","message":"Please authenticate"}');
        case "test.api.html": return send(502, "upstream unavailable");
        case "test.api.invalid": return send(200, "not json");
        case "test.api.schema": return send(200, '{"count":"wrong"}');
        case "test.api.empty": res.writeHead(204); return res.end();
        default: return send(404, "unknown method");
      }
    } catch (err) {
      return send(500, JSON.stringify({ error: "TestFailure", message: err.message }));
    }
  });
  server.on("error", onError);
  server.listen(0, "127.0.0.1", () => onSuccess({
    baseUrl: `http://127.0.0.1:${server.address().port}/`,
    close: () => { server.closeAllConnections(); server.close(); },
  }));
  return (_error, _onError, onCancel) => { server.close(); onCancel(); };
};

export const lengthArray = array => array.length;
