import {importScrobble as publish} from "../../../output/Rocksky.Cli.Import.Scrobble/index.js";
import {fromAff} from "../../../output/Control.Promise/index.js";
function protectScrobbleWrites(agent, index) {
  const publish = agent.scrobble.bind(agent);
  const running = /* @__PURE__ */ new Map();
  agent.scrobble = async (record) => {
    const secs = Math.floor(Date.parse(record.createdAt ?? "") / 1e3);
    if (!Number.isFinite(secs)) throw new Error("Imported scrobbles require a valid play timestamp");
    const normalize = (s) => s.normalize("NFC").trim().toLowerCase();
    const key = JSON.stringify([normalize(record.title), normalize(record.artist), secs]);
    while (running.has(key)) await running.get(key).catch(() => {
    });
    const task = (async () => {
      const existing = await index.scrobbleUri(agent.did, record.title, record.artist, record.album, secs);
      return existing ?? await publish(record);
    })();
    running.set(key, task);
    try {
      return await task;
    } finally {
      running.delete(key);
    }
  };
}
const importScrobble=(agent,input,dedup)=>fromAff(publish(agent)(input)(dedup))();
export {
  importScrobble,
  protectScrobbleWrites
};
