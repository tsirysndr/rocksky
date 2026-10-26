import * as Library from "../../../output/Rocksky.Cli.Tui.Library/index.js";
import {fromAff} from "../../../output/Control.Promise/index.js";
const run=action=>fromAff(action)();
const getPlaylists=creds=>run(Library.getPlaylists(creds));
const getStarred=creds=>run(Library.getStarred(creds));
const star=(creds,id)=>run(Library.star(creds)(id));
const unstar=(creds,id)=>run(Library.unstar(creds)(id));
const getPlaylist=(creds,id)=>run(Library.getPlaylist(creds)(id));
const getAlbum=(creds,id)=>run(Library.getAlbum(creds)(id));
const createPlaylist=(token,name)=>run(Library.createPlaylist(token)(name));
const deletePlaylist=(token,id)=>run(Library.deletePlaylist(token)(id));
const addTrackToPlaylist=(token,id,song)=>run(Library.addTrackToPlaylist(token)(id)(song));
const removeTrackFromPlaylist=(token,id,index)=>run(Library.removeTrackFromPlaylist(token)(id)(index));
const streamUrl=(creds,id)=>Library.streamUrl(creds)(id);
const exportQueue=(token,name,songs)=>run(Library.exportQueue(token)(name)(songs));
const entryToItem=Library.entryToItem;
import { ROCKSKY_API_URL, RockskyClient } from "../client.js";
import fs from "fs";
import os from "os";
import path from "path";
const NAVIDROME_URL = "https://navidrome.rocksky.app";
const credsPath = () => path.join(os.homedir(), ".rocksky", "navidrome.json");
let cachedCreds = null;
async function getCreds(token) {
  if (cachedCreds) return cachedCreds;
  try {
    const c = JSON.parse(fs.readFileSync(credsPath(), "utf-8"));
    if (c.handle && c.apiKey) return cachedCreds = c;
  } catch {
  }
  if (!token) return null;
  const client = new RockskyClient(token);
  const user = await client.getCurrentUser();
  const key = await client.createApiKey("rocksky-cli");
  const creds = { handle: user.handle, apiKey: key.api_key };
  try {
    fs.mkdirSync(path.dirname(credsPath()), { recursive: true });
    fs.writeFileSync(credsPath(), JSON.stringify(creds));
  } catch {
  }
  return cachedCreds = creds;
}
let cachedDid = null;
async function getDid(token) {
  if (cachedDid) return cachedDid;
  const user = await new RockskyClient(token).getCurrentUser();
  return cachedDid = user.did;
}
export {
  NAVIDROME_URL,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  entryToItem,
  exportQueue,
  getAlbum,
  getCreds,
  getDid,
  getPlaylist,
  getPlaylists,
  getStarred,
  removeTrackFromPlaylist,
  star,
  streamUrl,
  unstar
};
