import { loadToken } from "../lib/token.js";
import {
  NfcUnavailableError,
  nfcFavoritesPayloads,
  nfcPayloadsFor,
  openNfc,
  parseNfcPayload
} from "../lib/nfc.js";
import { c } from "../theme.js";
import { getAlbum, getCreds, getDid, getPlaylist } from "../tui/navidrome.js";
function fail(e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(c.error(message));
  process.exit(1);
}
async function describe(payload) {
  const target = parseNfcPayload(payload);
  if (!target) return c.link("not a Rocksky tag");
  const token = loadToken();
  if (!token) return `${target.kind}`;
  if (target.kind === "favorites") {
    const mine = await getDid(token).then(
      (did) => did === target.did,
      () => false
    );
    return `favorites \xB7 ${target.did}${mine ? c.highlight(" \xB7 yours") : c.link(" \xB7 not yours")}`;
  }
  try {
    const creds = await getCreds(token);
    if (!creds) return `${target.kind}`;
    const key = "uri" in target ? target.uri : target.id;
    const portable = "uri" in target ? c.highlight(" \xB7 portable") : "";
    if (target.kind === "album" || target.kind === "albumUri") {
      const { album } = await getAlbum(creds, key);
      return `album \xB7 ${album?.name ?? key}${portable}`;
    }
    const { playlist } = await getPlaylist(creds, key);
    return `playlist \xB7 ${playlist?.name ?? key}${portable}`;
  } catch {
    return `${target.kind} (not in your library)`;
  }
}
async function completeRef(kind, ref) {
  const token = loadToken();
  if (!token) throw new Error("not signed in");
  const creds = await getCreds(token);
  if (!creds) throw new Error("no library credentials");
  const found = kind === "album" ? (await getAlbum(creds, ref)).album : (await getPlaylist(creds, ref)).playlist;
  if (!found?.id) throw new Error("not in your library");
  return nfcPayloadsFor(kind, found);
}
async function nfcStatus() {
  try {
    const session = await openNfc();
    const readers = [];
    session.onReader((name, connected) => connected && readers.push(name));
    await new Promise((r) => setTimeout(r, 800));
    session.close();
    if (readers.length === 0) {
      console.log(c.link("No NFC reader connected."));
      console.log(
        c.muted("Plug in a PC/SC reader (ACR122U or another ACS/CCID model).")
      );
      process.exit(1);
    }
    console.log(c.highlight(`${readers.length} reader(s) connected:`));
    for (const name of readers) console.log(`  ${c.secondary(name)}`);
  } catch (e) {
    fail(e);
  }
}
async function nfcRead(opts = {}) {
  try {
    const session = await openNfc();
    console.log(c.accent("Hold a tag on the reader\u2026"));
    session.onTag(async ({ uid, payloads }) => {
      if (!payloads.length) {
        console.log(`${c.muted(uid)}  ${c.muted("empty tag")}`);
      }
      for (const [i, payload] of payloads.entries()) {
        const prefix = i === 0 ? c.muted(uid) : " ".repeat(uid.length);
        console.log(`${prefix}  ${payload}  ${await describe(payload)}`);
      }
      if (!opts.watch) {
        session.close();
        process.exit(0);
      }
    });
    if (!opts.watch) {
      setTimeout(() => {
        session.close();
        console.error(c.error("Timed out waiting for a tag."));
        process.exit(1);
      }, 3e4);
    }
  } catch (e) {
    fail(e);
  }
}
async function nfcWrite(opts) {
  const kind = opts.album ? "album" : opts.playlist ? "playlist" : null;
  const ref = opts.album ?? opts.playlist;
  if (!opts.favorites && (!kind || !ref)) {
    console.error(
      c.error("Pass --album <ref>, --playlist <ref> or --favorites.")
    );
    console.error(
      c.muted(
        "A ref is the record's AT-URI (at://\u2026/app.rocksky.album/\u2026), which makes\nthe tag work on any Rocksky player, or a library id, which does not.\n`rocksky` (TUI) \u2192 My Music \u2192 T picks the right one for you.\n--favorites needs no ref: the tag names you, and plays your favorites\nwherever you're signed in."
      )
    );
    process.exit(1);
  }
  let payloads;
  if (opts.favorites) {
    const token = loadToken();
    if (!token) fail(new Error("Sign in first: rocksky login"));
    payloads = await getDid(token).then(nfcFavoritesPayloads, fail);
  } else {
    payloads = await completeRef(kind, ref).catch(
      () => nfcPayloadsFor(kind, ref.startsWith("at://") ? { uri: ref } : { id: ref })
    );
  }
  const portable = opts.favorites || payloads.some((p) => p.startsWith("at://"));
  try {
    const session = await openNfc();
    console.log(
      c.accent(`Hold a tag on the reader to write ${c.secondary(payloads.join(" + "))}\u2026`)
    );
    await session.write(payloads);
    session.close();
    console.log(
      c.highlight(
        opts.favorites ? "Tag written. Tap it on any Rocksky player you're signed in to." : portable ? "Tag written. Tap it on any Rocksky player to play." : "Tag written. Tap it to play \u2014 this ref is a library id, so the tag only works in your own library."
      )
    );
    process.exit(0);
  } catch (e) {
    if (e instanceof NfcUnavailableError) fail(e);
    fail(e);
  }
}
export {
  nfcRead,
  nfcStatus,
  nfcWrite
};
