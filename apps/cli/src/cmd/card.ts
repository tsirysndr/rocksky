// `rocksky card` — read and write SLE and ACOS contact cards.
//
// The contactless equivalent is `rocksky nfc` (src/cmd/nfc.ts). These are
// separate commands rather than one, because the two families need different
// PC/SC clients and running both against one reader at the same time would
// interleave their APDUs. A card session is opened for the operation and closed
// straight after.

import chalk from "chalk";
import { loadToken } from "lib/token";
import { CardUnavailableError, openCard } from "../lib/card-reader";
import { cardLabel, cardSecret, fitPayloads, readCard, writeCard } from "../lib/cards";
import { nfcPayloadsFor, parseNfcPayloads } from "../lib/nfc";
import { getAlbum, getCreds, getPlaylist } from "../tui/navidrome";

const violet = chalk.hex("#A855F7");
const cyan = chalk.hex("#22D3EE");

function fail(e: unknown): never {
  const message = e instanceof Error ? e.message : String(e);
  console.error(chalk.red(message));
  process.exit(1);
}

/** Describe what a payload points at, so a dump reads as more than a URI. */
async function describe(payload: string): Promise<string> {
  const [target] = parseNfcPayloads([payload]);
  if (!target) return chalk.yellow("not a Rocksky record");
  // Favorites name a person rather than a record; cards don't carry them, but
  // the shared parser can still produce one.
  if (target.kind === "favorites") return `favorites of ${target.did}`;
  const token = loadToken();
  if (!token) return target.kind;
  try {
    const creds = await getCreds(token);
    if (!creds) return target.kind;
    const key = "uri" in target ? target.uri : target.id;
    const portable = "uri" in target ? chalk.green(" · portable") : "";
    if (target.kind === "album" || target.kind === "albumUri") {
      const { album } = await getAlbum(creds, key);
      return `album · ${album?.name ?? key}${portable}`;
    }
    const { playlist } = await getPlaylist(creds, key);
    return `playlist · ${playlist?.name ?? key}${portable}`;
  } catch {
    return `${target.kind} (not in your library)`;
  }
}

export async function cardRead() {
  let session;
  try {
    session = await openCard();
  } catch (e) {
    fail(e);
  }
  try {
    console.log(`${violet("Reader:")} ${session.reader}`);
    console.log(`${violet("Card:")}   ${cardLabel(session.kind)}`);
    console.log(`${violet("ATR:")}    ${session.atr.toString("hex").toUpperCase()}`);

    const payloads = await readCard(session.transmit, session.kind);
    if (!payloads.length) {
      console.log(chalk.dim("\nThe card holds nothing we can play."));
      return;
    }
    console.log();
    for (const p of payloads) {
      console.log(`  ${cyan(p)}\n    ${await describe(p)}`);
    }
  } catch (e) {
    fail(e);
  } finally {
    session.close();
  }
  // The PC/SC binding keeps the event loop alive after close(), so say when we
  // are done rather than leaving the command hanging on a finished read.
  process.exit(0);
}

export async function cardWrite(opts: {
  album?: string;
  playlist?: string;
  secret?: string;
}) {
  const kind = opts.album ? "album" : opts.playlist ? "playlist" : null;
  const ref = opts.album ?? opts.playlist;
  if (!kind || !ref) {
    console.error(chalk.red("Pass either --album <ref> or --playlist <ref>."));
    console.error(
      chalk.dim(
        "A ref is the record's AT-URI (at://…/app.rocksky.album/…), which makes\n" +
          "the card work on any Rocksky player, or a library id, which does not.",
      ),
    );
    process.exit(1);
  }

  // Both halves when we can get them: the record URI plays anywhere, the
  // library id is the fallback. Whichever the user passed, look up the other.
  let payloads = ref.startsWith("at://")
    ? nfcPayloadsFor(kind, { uri: ref })
    : nfcPayloadsFor(kind, { id: ref });
  try {
    const token = loadToken();
    const creds = token ? await getCreds(token) : null;
    if (creds) {
      const found =
        kind === "album"
          ? (await getAlbum(creds, ref)).album
          : (await getPlaylist(creds, ref)).playlist;
      if (found?.id) payloads = nfcPayloadsFor(kind, found);
    }
  } catch {
    // Offline or signed out — write the half we were handed.
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
    console.log(`${violet("Card:")} ${cardLabel(session.kind)} on ${session.reader}`);
    if (!opts.secret) {
      console.log(chalk.dim(`Using the factory-default ${label} ${fallback}.`));
    }
    if (session.kind === "sle5528") {
      console.log(
        chalk.dim(
          "A wrong PSC counts against the card's retry counter, and enough wrong\n" +
            "ones lock it for good.",
        ),
      );
    }

    const written = await writeCard(session.transmit, session.kind, payloads, secret);
    console.log(chalk.green(`\nWrote and verified ${written.length} record(s):`));
    for (const p of written) console.log(`  ${cyan(p)}`);
    const dropped = payloads.length - written.length;
    if (dropped > 0) {
      console.log(
        chalk.dim(
          `\nThe card had room for ${written.length} of ${payloads.length}. The record URI is\n` +
            "what plays; the library-id fallback was dropped.",
        ),
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
