import { createHash } from "node:crypto";
import { queryClient } from "./queryClient.js";
import * as Library from "../../../output/Rocksky.Cli.Tui.Library/index.js";
import { fromAff } from "../../../output/Control.Promise/index.js";
const run = (action) => fromAff(action)();
const getPlaylists = (creds) => run(Library.getPlaylists(creds));
const getAlbums = (creds, offset=0, size=50) => run(Library.getAlbums(creds)(offset)(size));
const getArtists = creds => run(Library.getArtists(creds));
const getArtist = (creds,id) => run(Library.getArtist(creds)(id));
const getTracks = (creds,offset=0,size=50) => run(Library.getTracks(creds)(offset)(size));
const getStarred = (creds) => run(Library.getStarred(creds));
const star = (creds, id) => run(Library.star(creds)(id));
const unstar = (creds, id) => run(Library.unstar(creds)(id));
const getPlaylist = (creds, id) => run(Library.getPlaylist(creds)(id));
const getAlbum = (creds, id) => run(Library.getAlbum(creds)(id));
const createPlaylist = (token, name) =>
  run(Library.createPlaylist(token)(name));
const deletePlaylist = (token, id) => run(Library.deletePlaylist(token)(id));
const addTrackToPlaylist = (token, id, song) =>
  run(Library.addTrackToPlaylist(token)(id)(song));
const removeTrackFromPlaylist = (token, id, index) =>
  run(Library.removeTrackFromPlaylist(token)(id)(index));
const streamUrl = (creds, id) => Library.streamUrl(creds)(id);
const exportQueue = (token, name, songs) =>
  run(Library.exportQueue(token)(name)(songs));
const entryToItem = Library.entryToItem;
import { ROCKSKY_API_URL, RockskyClient } from "../client.js";
import fs from "fs";
import os from "os";
import path from "path";
const NAVIDROME_URL = "https://navidrome.rocksky.app";
const credsPath = () => path.join(os.homedir(), ".rocksky", "navidrome.json");
const credentialRequests = new Map();
const credentialsByToken = new Map();

function getCreds(token) {
  if (!token) return Promise.resolve(null);
  const cached = credentialsByToken.get(token);
  if (cached) return Promise.resolve(cached);
  const pending = credentialRequests.get(token);
  if (pending) return pending;
  const work = (async () => {
    const account = createHash("sha256").update(token).digest("hex");
    let stored;
    try {
      stored = JSON.parse(fs.readFileSync(credsPath(), "utf8"));
    } catch {}
    if (stored?.account === account && stored.handle && stored.apiKey) {
      credentialsByToken.set(token, stored);
      return stored;
    }
    const client = new RockskyClient(token);
    const user = await queryClient.fetchQuery({
      queryKey: ["me", token],
      queryFn: () => client.getCurrentUser(),
    });
    const creds =
      stored?.handle === user.handle && stored.apiKey
        ? { handle: stored.handle, apiKey: stored.apiKey }
        : {
            handle: user.handle,
            apiKey: (await client.createApiKey("rocksky-cli")).api_key,
          };
    credentialsByToken.set(token, creds);
    try {
      fs.mkdirSync(path.dirname(credsPath()), { recursive: true, mode: 0o700 });
      fs.writeFileSync(credsPath(), JSON.stringify({ ...creds, account }), {
        mode: 0o600,
      });
    } catch {}
    return creds;
  })();
  credentialRequests.set(token, work);
  void work.finally(() => credentialRequests.delete(token)).catch(() => {});
  return work;
}

async function getDid(token) {
  const user = await queryClient.fetchQuery({
    queryKey: ["me", token],
    queryFn: () => new RockskyClient(token).getCurrentUser(),
  });
  return user.did;
}

export {
  NAVIDROME_URL,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  entryToItem,
  exportQueue,
  getAlbum,
  getAlbums,
  getArtists,
  getArtist,
  getTracks,
  getCreds,
  getDid,
  getPlaylist,
  getPlaylists,
  getStarred,
  removeTrackFromPlaylist,
  star,
  streamUrl,
  unstar,
};
