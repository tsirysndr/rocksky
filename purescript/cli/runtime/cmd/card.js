import { loadToken } from "../lib/token.js";
import { CardUnavailableError, openCard } from "../lib/card-reader.js";
import { cardLabel, cardSecret, readCard, writeCard } from "../lib/cards.js";
import { nfcFavoritesPayloads, nfcPayloadsFor, parseNfcPayloads } from "../lib/nfc.js";
import { c } from "../theme.js";
import { getAlbum, getCreds, getDid, getPlaylist } from "../tui/navidrome.js";
function fail(e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(c.error(message));
  process.exit(1);
}
async function describe(payload) {
  const [target] = parseNfcPayloads([payload]);
  if (!target) return c.link("not a Rocksky record");
  if (target.kind === "favorites") return `favorites of ${target.did}`;
  const token = loadToken();
  if (!token) return target.kind;
  try {
    const creds = await getCreds(token);
    if (!creds) return target.kind;
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
async function cardRead() {
  let session;
  try {
    session = await openCard();
  } catch (e) {
    fail(e);
  }
  try {
    console.log(`${c.accent("Reader:")} ${session.reader}`);
    console.log(`${c.accent("Card:")}   ${cardLabel(session.kind)}`);
    console.log(`${c.accent("ATR:")}    ${session.atr.toString("hex").toUpperCase()}`);
    const payloads = await readCard(session.transmit, session.kind);
    if (!payloads.length) {
      console.log(c.muted("\nThe card holds nothing we can play."));
      return;
    }
    console.log();
    for (const p of payloads) {
      console.log(`  ${c.secondary(p)}
    ${await describe(p)}`);
    }
  } catch (e) {
    fail(e);
  } finally {
    session.close();
  }
  process.exit(0);
}
async function cardWrite(opts) {
  const kind = opts.album ? "album" : opts.playlist ? "playlist" : null;
  const ref = opts.album ?? opts.playlist;
  if (!opts.favorites && (!kind || !ref)) {
    console.error(
      c.error("Pass --album <ref>, --playlist <ref> or --favorites.")
    );
    console.error(
      c.muted(
        "A ref is the record's AT-URI (at://\u2026/app.rocksky.album/\u2026), which makes\nthe card work on any Rocksky player, or a library id, which does not."
      )
    );
    process.exit(1);
  }
  let payloads;
  if (opts.favorites) {
    const token = loadToken();
    if (!token) fail(new Error("Sign in first: rocksky login"));
    payloads = nfcFavoritesPayloads(await getDid(token));
  } else {
    payloads = ref.startsWith("at://") ? nfcPayloadsFor(kind, { uri: ref }) : nfcPayloadsFor(kind, { id: ref });
    try {
      const token = loadToken();
      const creds = token ? await getCreds(token) : null;
      if (creds) {
        const found = kind === "album" ? (await getAlbum(creds, ref)).album : (await getPlaylist(creds, ref)).playlist;
        if (found?.id) payloads = nfcPayloadsFor(kind, found);
      }
    } catch {
    }
  }
  let session;
  try {
    session = await openCard();
  } catch (e) {
    fail(e);
  }
  try {
    const { label, fallback } = cardSecret(session.kind);
    const secret = opts.secret ?? fallback;
    console.log(`${c.accent("Card:")} ${cardLabel(session.kind)} on ${session.reader}`);
    if (!opts.secret) {
      console.log(c.muted(`Using the factory-default ${label} ${fallback}.`));
    }
    if (session.kind === "sle5528") {
      console.log(
        c.muted(
          "A wrong PSC counts against the card's retry counter, and enough wrong\nones lock it for good."
        )
      );
    }
    const written = await writeCard(session.transmit, session.kind, payloads, secret);
    console.log(c.highlight(`
Wrote and verified ${written.length} record(s):`));
    for (const p of written) console.log(`  ${c.secondary(p)}`);
    const dropped = payloads.length - written.length;
    if (dropped > 0) {
      console.log(
        c.muted(
          `
The card had room for ${written.length} of ${payloads.length}. The record URI is
what plays; the library-id fallback was dropped.`
        )
      );
    }
  } catch (e) {
    if (e instanceof CardUnavailableError) fail(e);
    fail(e);
  } finally {
    session.close();
  }
  process.exit(0);
}
export {
  cardRead,
  cardWrite
};
