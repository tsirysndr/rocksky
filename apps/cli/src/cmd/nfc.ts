// `rocksky nfc` — write and inspect NFC tags outside the TUI.
//
// Inside the TUI, T on an album or playlist writes a tag and a tap plays it
// (see src/tui/nfc.ts). These subcommands cover the scripted cases: checking
// that a reader works, dumping what a tag holds, and writing a known library id.

import chalk from "chalk";
import { loadToken } from "lib/token";
import {
  NfcUnavailableError,
  nfcFavoritesPayloads,
  nfcPayloadsFor,
  openNfc,
  parseNfcPayload,
} from "../lib/nfc";
import { getAlbum, getCreds, getDid, getPlaylist } from "../tui/navidrome";

const violet = chalk.hex("#A855F7");
const cyan = chalk.hex("#22D3EE");

function fail(e: unknown): never {
  const message = e instanceof Error ? e.message : String(e);
  console.error(chalk.red(message));
  process.exit(1);
}

/** Describe what a payload points at, so a dump is readable rather than a URI. */
async function describe(payload: string): Promise<string> {
  const target = parseNfcPayload(payload);
  if (!target) return chalk.yellow("not a Rocksky tag");
  const token = loadToken();
  if (!token) return `${target.kind}`;
  // Favorites name a person, so there is nothing to look up — but say whose,
  // since only their own player can play the tag.
  if (target.kind === "favorites") {
    const mine = await getDid(token).then(
      (did) => did === target.did,
      () => false,
    );
    return `favorites · ${target.did}${mine ? chalk.green(" · yours") : chalk.yellow(" · not yours")}`;
  }
  try {
    const creds = await getCreds(token);
    if (!creds) return `${target.kind}`;
    // Both lookups take a record URI or a library id, so the only difference
    // between a portable tag and a legacy one is which key gets passed.
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

/**
 * Both tag records for a ref that is only one of them. Throws when the library
 * can't be reached or doesn't have it, which the caller treats as "write what
 * the user gave me" rather than an error — a tag with one good record beats no
 * tag at all.
 */
async function completeRef(
  kind: "album" | "playlist",
  ref: string,
): Promise<string[]> {
  const token = loadToken();
  if (!token) throw new Error("not signed in");
  const creds = await getCreds(token);
  if (!creds) throw new Error("no library credentials");

  const found =
    kind === "album"
      ? (await getAlbum(creds, ref)).album
      : (await getPlaylist(creds, ref)).playlist;
  if (!found?.id) throw new Error("not in your library");

  return nfcPayloadsFor(kind, found);
}

export async function nfcStatus() {
  try {
    const session = await openNfc();
    const readers: string[] = [];
    session.onReader((name, connected) => connected && readers.push(name));
    // Readers announce themselves asynchronously right after the session opens.
    await new Promise((r) => setTimeout(r, 800));
    session.close();

    if (readers.length === 0) {
      console.log(chalk.yellow("No NFC reader connected."));
      console.log(
        chalk.dim("Plug in a PC/SC reader (ACR122U or another ACS/CCID model)."),
      );
      process.exit(1);
    }
    console.log(chalk.green(`${readers.length} reader(s) connected:`));
    for (const name of readers) console.log(`  ${cyan(name)}`);
  } catch (e) {
    fail(e);
  }
}

export async function nfcRead(opts: { watch?: boolean } = {}) {
  try {
    const session = await openNfc();
    console.log(violet("Hold a tag on the reader…"));

    session.onTag(async ({ uid, payloads }) => {
      if (!payloads.length) {
        console.log(`${chalk.dim(uid)}  ${chalk.dim("empty tag")}`);
      }
      // One line per record, in tag order — a dump should show the fallback as
      // well as the URI that gets tried first.
      for (const [i, payload] of payloads.entries()) {
        const prefix = i === 0 ? chalk.dim(uid) : " ".repeat(uid.length);
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
        console.error(chalk.red("Timed out waiting for a tag."));
        process.exit(1);
      }, 30_000);
    }
  } catch (e) {
    fail(e);
  }
}

export async function nfcWrite(opts: {
  album?: string;
  playlist?: string;
  favorites?: boolean;
}) {
  const kind = opts.album ? "album" : opts.playlist ? "playlist" : null;
  const ref = opts.album ?? opts.playlist;
  if (!opts.favorites && (!kind || !ref)) {
    console.error(
      chalk.red("Pass --album <ref>, --playlist <ref> or --favorites."),
    );
    console.error(
      chalk.dim(
        "A ref is the record's AT-URI (at://…/app.rocksky.album/…), which makes\n" +
          "the tag work on any Rocksky player, or a library id, which does not.\n" +
          "`rocksky` (TUI) → My Music → T picks the right one for you.\n" +
          "--favorites needs no ref: the tag names you, and plays your favorites\n" +
          "wherever you're signed in.",
      ),
    );
    process.exit(1);
  }

  // Favorites are a query with no record and no library id, so the tag holds
  // the user's DID. That needs a session — there is nothing to fall back on.
  let payloads: string[];
  if (opts.favorites) {
    const token = loadToken();
    if (!token) fail(new Error("Sign in first: rocksky login"));
    payloads = await getDid(token).then(nfcFavoritesPayloads, fail);
  } else {
    // A tag wants both halves: the record URI, which plays anywhere, and the
    // library id behind it as the fallback. The ref is only ever one of the two,
    // so look the other up — both lookups accept either key. Offline, signed out
    // or not in the library, we write the half we were handed.
    payloads = await completeRef(kind!, ref!).catch(() =>
      nfcPayloadsFor(kind!, ref!.startsWith("at://") ? { uri: ref! } : { id: ref! }),
    );
  }
  const portable = opts.favorites || payloads.some((p) => p.startsWith("at://"));

  try {
    const session = await openNfc();
    console.log(
      violet(`Hold a tag on the reader to write ${cyan(payloads.join(" + "))}…`),
    );
    await session.write(payloads);
    session.close();
    console.log(
      chalk.green(
        opts.favorites
          ? "Tag written. Tap it on any Rocksky player you're signed in to."
          : portable
            ? "Tag written. Tap it on any Rocksky player to play."
            : "Tag written. Tap it to play — this ref is a library id, so the tag only works in your own library.",
      ),
    );
    process.exit(0);
  } catch (e) {
    if (e instanceof NfcUnavailableError) fail(e);
    fail(e);
  }
}
