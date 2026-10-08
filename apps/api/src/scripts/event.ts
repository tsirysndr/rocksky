// Publishes a music event from the terminal: a community.lexicon.calendar.event
// record followed by the app.rocksky.event.music record that marks it as one
// and names the lineup. Both land in the given repo, which has to be one of
// the EVENT_PUBLISHER_DIDS for jetstream to index them.
//
//   bun event -- <handle|did>

import chalk from "chalk";
import { consola } from "consola";
import { ctx } from "context";
import { sql } from "drizzle-orm";
import type * as CalendarEvent from "lexicon/types/community/lexicon/calendar/event";
import type * as EventMusic from "lexicon/types/app/rocksky/event/music";
import { createAgent } from "lib/agent";
import prompts from "prompts";
import tables from "schema";

const CALENDAR_EVENT = "community.lexicon.calendar.event";
const EVENT_MUSIC = "app.rocksky.event.music";

const args = process.argv.slice(2);

if (args.length === 0) {
  consola.error("Please provide the publisher identifier (handle or DID).");
  console.log(`Usage: ${chalk.cyan("bun event -- <handle|did>")}`);
  process.exit(1);
}

// prompts resolves with an empty object on Ctrl-C; treat that as a cancel
// everywhere rather than carrying `undefined` into the record.
const onCancel = () => {
  consola.info("Event creation cancelled.");
  process.exit(0);
};

const ask = async <T>(question: Omit<prompts.PromptObject, "name">) =>
  (
    await prompts({ ...question, name: "value" } as prompts.PromptObject, {
      onCancel,
    })
  ).value as T;

const text = (message: string, initial?: string) =>
  ask<string>({ type: "text", message, initial }).then((v) => v?.trim() ?? "");

const optional = (value: string) => (value === "" ? undefined : value);

const datetime = async (message: string, required: boolean) => {
  for (;;) {
    const value = await text(message);
    if (!value && !required) return undefined;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
    consola.warn("Not a date. Use ISO-8601, e.g. 2026-12-01T20:00:00+01:00");
  }
};

const choose = <T extends string>(
  message: string,
  choices: { title: string; value: T }[],
  initial = 0,
) => ask<T>({ type: "select", message, choices, initial });

// --- the calendar event ----------------------------------------------------

const name = await text("Event name");
if (name.length < 1) {
  consola.error("The event needs a name.");
  process.exit(1);
}
const description = optional(await text("Description (optional)"));
const startsAt = await datetime("Starts at (ISO-8601)", true);
const endsAt = await datetime("Ends at (ISO-8601, optional)", false);

const mode = await choose("Attendance mode", [
  { title: "In person", value: "community.lexicon.calendar.event#inperson" },
  { title: "Virtual", value: "community.lexicon.calendar.event#virtual" },
  { title: "Hybrid", value: "community.lexicon.calendar.event#hybrid" },
]);
const status = await choose("Status", [
  { title: "Scheduled", value: "community.lexicon.calendar.event#scheduled" },
  { title: "Planned", value: "community.lexicon.calendar.event#planned" },
  {
    title: "Rescheduled",
    value: "community.lexicon.calendar.event#rescheduled",
  },
  { title: "Postponed", value: "community.lexicon.calendar.event#postponed" },
  { title: "Cancelled", value: "community.lexicon.calendar.event#cancelled" },
]);

const locations: CalendarEvent.Record["locations"] = [];
if (mode !== "community.lexicon.calendar.event#virtual") {
  const venue = await text("Venue name");
  const country = (
    await text("Country (ISO 3166 code, e.g. FR)")
  ).toUpperCase();
  if (country.length < 2) {
    consola.error("A venue needs at least a country code.");
    process.exit(1);
  }
  locations.push({
    $type: "community.lexicon.location.address",
    name: optional(venue),
    country,
    locality: optional(await text("City (optional)")),
    region: optional(await text("Region / state (optional)")),
    street: optional(await text("Street address (optional)")),
    postalCode: optional(await text("Postal code (optional)")),
  });
  const latitude = optional(await text("Latitude (optional)"));
  const longitude = optional(await text("Longitude (optional)"));
  if (latitude && longitude) {
    locations.push({
      $type: "community.lexicon.location.geo",
      name: optional(venue),
      latitude,
      longitude,
    });
  }
}
if (mode !== "community.lexicon.calendar.event#inperson") {
  const stream = optional(await text("Stream / online venue URL"));
  if (stream) {
    locations.push({
      $type: "community.lexicon.calendar.event#uri",
      uri: stream,
      name: "Online",
    });
  }
}

const uris: CalendarEvent.Record["uris"] = [];
const website = optional(await text("Event website (optional)"));
if (website) uris.push({ uri: website, name: "Website" });

// --- the music annotation --------------------------------------------------

const kind = await choose("Kind of event", [
  { title: "Concert", value: "concert" },
  { title: "Festival", value: "festival" },
  { title: "Club night", value: "club-night" },
  { title: "DJ set", value: "dj-set" },
  { title: "Livestream", value: "livestream" },
  { title: "Release party", value: "release-party" },
  { title: "Listening party", value: "listening-party" },
]);
const genre = optional(await text("Main genre (optional)"));
const tags = (
  await ask<string[]>({
    type: "list",
    message: "Tags, comma-separated (optional)",
    separator: ",",
  })
)
  .map((t) => t.trim())
  .filter(Boolean);

// A billed name is linked to the Rocksky artist page when one exists, so the
// record carries the artist's AT-URI and the appview does not have to guess.
const artistUri = async (artistName: string) => {
  const row = await ctx.db
    .select({ uri: tables.artists.uri })
    .from(tables.artists)
    .where(sql`lower(${tables.artists.name}) = lower(${artistName})`)
    .limit(1)
    .then((rows) => rows[0]);
  return row?.uri ?? undefined;
};

const artists: EventMusic.Artist[] = [];
for (;;) {
  const artistName = await text(
    artists.length === 0
      ? "Artist name (headliner)"
      : "Next artist (leave empty to finish)",
  );
  if (!artistName) {
    if (artists.length === 0) {
      consola.error("A music event needs at least one artist.");
      process.exit(1);
    }
    break;
  }
  const known = await artistUri(artistName);
  const uri = optional(await text("Artist AT-URI (optional)", known));
  if (known) consola.info(`Linked to ${chalk.cyan(known)}`);
  const role = await choose(
    "Role",
    [
      { title: "Headliner", value: "headliner" },
      { title: "Support", value: "support" },
      { title: "Opener", value: "opener" },
      { title: "DJ", value: "dj" },
      { title: "Special guest", value: "special-guest" },
      { title: "Performer", value: "performer" },
    ],
    artists.length === 0 ? 0 : 1,
  );
  const stage =
    kind === "festival" ? optional(await text("Stage (optional)")) : undefined;
  const setTime = await datetime("Set time (ISO-8601, optional)", false);
  const mbid = optional(await text("MusicBrainz artist id (optional)"));
  artists.push({ name: artistName, uri, role, stage, startsAt: setTime, mbid });
}

const externalIds: EventMusic.ExternalIds = {};
for (const [key, label] of [
  ["ticketmaster", "Ticketmaster"],
  ["songkick", "Songkick"],
  ["bandsintown", "Bandsintown"],
  ["residentAdvisor", "Resident Advisor"],
  ["setlistfm", "setlist.fm"],
  ["dice", "DICE"],
  ["eventbrite", "Eventbrite"],
] as const) {
  const id = optional(await text(`${label} event id (optional)`));
  if (id) externalIds[key] = id;
}
const ticketsUrl = optional(await text("Tickets URL (optional)"));
const imageUrl = optional(await text("Poster image URL (optional)"));

// --- confirm and publish ---------------------------------------------------

const createdAt = new Date().toISOString();
const calendarRecord: CalendarEvent.Record = {
  $type: CALENDAR_EVENT,
  name,
  description,
  createdAt,
  startsAt,
  endsAt,
  mode,
  status,
  locations,
  uris,
};

consola.info("Creating event with the following details:");
consola.info("---");
console.log(JSON.stringify(calendarRecord, null, 2));
console.log(
  JSON.stringify(
    {
      $type: EVENT_MUSIC,
      kind,
      genre,
      tags,
      artists,
      externalIds,
      ticketsUrl,
      imageUrl,
    },
    null,
    2,
  ),
);

const confirm = await ask<boolean>({
  type: "confirm",
  message: "Do you want to proceed?",
  initial: true,
});
if (!confirm) onCancel();

let publisherDid = args[0];
if (!publisherDid.startsWith("did:")) {
  publisherDid = await ctx.baseIdResolver.handle.resolve(publisherDid);
}

const agent = await createAgent(ctx.oauthClient, publisherDid);

consola.info(`Writing ${chalk.greenBright(CALENDAR_EVENT)} record...`);
const calendar = await agent.com.atproto.repo.createRecord({
  repo: agent.assertDid,
  collection: CALENDAR_EVENT,
  record: calendarRecord,
});
consola.info(`Record created at: ${chalk.cyan(calendar.data.uri)}`);

const musicRecord: EventMusic.Record = {
  $type: EVENT_MUSIC,
  subject: { uri: calendar.data.uri, cid: calendar.data.cid },
  kind,
  artists,
  genre,
  tags: tags.length ? tags : undefined,
  externalIds: Object.keys(externalIds).length ? externalIds : undefined,
  ticketsUrl,
  imageUrl,
  createdAt,
};

consola.info(`Writing ${chalk.greenBright(EVENT_MUSIC)} record...`);
const music = await agent.com.atproto.repo.createRecord({
  repo: agent.assertDid,
  collection: EVENT_MUSIC,
  record: musicRecord,
});

consola.info(chalk.greenBright("Event created successfully!"));
consola.info(`Record created at: ${chalk.cyan(music.data.uri)}`);
consola.info(
  `Delete the ${EVENT_MUSIC} record to remove the event from Rocksky; the calendar event stays yours.`,
);

process.exit(0);
