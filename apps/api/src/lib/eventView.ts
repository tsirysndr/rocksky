import { type HandlerAuth, InvalidRequestError } from "@atproto/xrpc-server";
import type { Context } from "context";
import { and, asc, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  ArtistView,
  EventView,
  LocationView,
  RsvpCounts,
  RsvpView,
  UriView,
} from "lexicon/types/app/rocksky/event/defs";
import type { ExternalIds } from "lexicon/types/app/rocksky/event/music";
import tables from "schema";
import type { SelectArtist } from "schema/artists";
import type { SelectEventArtist } from "schema/event-artists";
import type { SelectEventRsvp } from "schema/event-rsvps";
import type { SelectEvent } from "schema/events";
import type { SelectUser } from "schema/users";

export const RSVP_GOING = "community.lexicon.calendar.rsvp#going";
export const RSVP_INTERESTED = "community.lexicon.calendar.rsvp#interested";
export const RSVP_NOT_GOING = "community.lexicon.calendar.rsvp#notgoing";

export type EventRow = { events: SelectEvent; users: SelectUser };

// Every event query is public; a token only fills in `viewerRsvp`.
export const viewerDid = (auth: HandlerAuth): string | undefined =>
  auth?.credentials?.did as string | undefined;

// Drops undefined and null members so a view only carries the fields it has;
// the lexicon marks everything but the identity fields optional.
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as T;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

// The calendar record's `locations` is a union of five shapes keyed by $type;
// each is flattened onto the one view so clients get a single object to read.
export function toLocationView(raw: unknown): LocationView | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const type = asString(value.$type);
  const name = asString(value.name);
  switch (type) {
    case "community.lexicon.location.address":
      return compact({
        type,
        name,
        country: asString(value.country),
        postalCode: asString(value.postalCode),
        region: asString(value.region),
        locality: asString(value.locality),
        street: asString(value.street),
      });
    case "community.lexicon.location.geo":
      return compact({
        type,
        name,
        latitude: asString(value.latitude),
        longitude: asString(value.longitude),
        altitude: asString(value.altitude),
      });
    case "community.lexicon.location.fsq":
      return compact({
        type,
        name,
        fsqPlaceId: asString(value.fsq_place_id),
        latitude: asString(value.latitude),
        longitude: asString(value.longitude),
      });
    case "community.lexicon.location.hthree":
      return compact({ type, name, h3: asString(value.value) });
    case "community.lexicon.calendar.event#uri":
      return compact({ type, name, uri: asString(value.uri) });
    default:
      return null;
  }
}

function toUriView(raw: unknown): UriView | null {
  if (!raw || typeof raw !== "object") return null;
  const uri = asString((raw as Record<string, unknown>).uri);
  return uri
    ? compact({ uri, name: asString((raw as Record<string, unknown>).name) })
    : null;
}

export function toArtistView(
  row: SelectEventArtist,
  artist: SelectArtist | null,
): ArtistView {
  return compact({
    id: artist?.id,
    uri: artist?.uri ?? undefined,
    sha256: artist?.sha256,
    name: row.name,
    picture: artist?.picture ?? undefined,
    mbid: row.mbid ?? undefined,
    role: row.role ?? undefined,
    stage: row.stage ?? undefined,
    startsAt: row.startsAt?.toISOString(),
  });
}

export function toRsvpView(row: SelectEventRsvp, user: SelectUser): RsvpView {
  return compact({
    uri: row.uri,
    cid: row.cid ?? undefined,
    status: row.status,
    did: user.did,
    handle: user.handle,
    displayName: user.displayName,
    avatar: user.avatar || undefined,
    createdAt: row.createdAt.toISOString(),
  });
}

export function toEventView(
  row: EventRow,
  artists: ArtistView[],
  rsvpCounts: RsvpCounts,
  viewerRsvp?: string,
): EventView {
  const { events: event, users: organizer } = row;
  return compact({
    id: event.id,
    uri: event.uri,
    cid: event.cid ?? undefined,
    musicUri: event.musicUri,
    musicCid: event.musicCid ?? undefined,
    name: event.name,
    description: event.description ?? undefined,
    kind: event.kind ?? undefined,
    genre: event.genre ?? undefined,
    tags: event.tags ?? undefined,
    startsAt: event.startsAt?.toISOString(),
    endsAt: event.endsAt?.toISOString(),
    mode: event.mode ?? undefined,
    status: event.status ?? undefined,
    imageUrl: event.imageUrl ?? undefined,
    ticketsUrl: event.ticketsUrl ?? undefined,
    locations: (event.locations ?? [])
      .map(toLocationView)
      .filter((l): l is LocationView => l !== null),
    uris: (event.uris ?? [])
      .map(toUriView)
      .filter((u): u is UriView => u !== null),
    artists,
    externalIds: (event.externalIds as ExternalIds | null) ?? undefined,
    organizerDid: organizer.did,
    organizerHandle: organizer.handle,
    organizerName: organizer.displayName,
    organizerAvatarUrl: organizer.avatar || undefined,
    rsvpCounts,
    viewerRsvp,
    createdAt: (event.createdAt ?? event.xataCreatedAt).toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  });
}

// Builds the views for a page of events in three queries (lineups, rsvp
// tallies, the viewer's own rsvps) rather than three per event.
export async function hydrateEvents(
  ctx: Context,
  rows: EventRow[],
  viewerDid?: string,
): Promise<EventView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.events.id);

  const [lineup, tallies, viewerRsvps] = await Promise.all([
    ctx.db
      .select({ entry: tables.eventArtists, artist: tables.artists })
      .from(tables.eventArtists)
      .leftJoin(
        tables.artists,
        eq(tables.eventArtists.artistId, tables.artists.id),
      )
      .where(inArray(tables.eventArtists.eventId, ids))
      .orderBy(asc(tables.eventArtists.position))
      .execute(),
    ctx.db
      .select({
        eventId: tables.eventRsvps.eventId,
        status: tables.eventRsvps.status,
        count: sql<number>`count(*)::int`,
      })
      .from(tables.eventRsvps)
      .where(inArray(tables.eventRsvps.eventId, ids))
      .groupBy(tables.eventRsvps.eventId, tables.eventRsvps.status)
      .execute(),
    viewerDid
      ? ctx.db
          .select({
            eventId: tables.eventRsvps.eventId,
            status: tables.eventRsvps.status,
          })
          .from(tables.eventRsvps)
          .innerJoin(
            tables.users,
            eq(tables.eventRsvps.userId, tables.users.id),
          )
          .where(
            and(
              inArray(tables.eventRsvps.eventId, ids),
              eq(tables.users.did, viewerDid),
            ),
          )
          .execute()
      : Promise.resolve([]),
  ]);

  const artistsByEvent = new Map<string, ArtistView[]>();
  for (const { entry, artist } of lineup) {
    const list = artistsByEvent.get(entry.eventId) ?? [];
    list.push(toArtistView(entry, artist));
    artistsByEvent.set(entry.eventId, list);
  }

  const countsByEvent = new Map<string, RsvpCounts>();
  for (const { eventId, status, count } of tallies) {
    const counts = countsByEvent.get(eventId) ?? {
      going: 0,
      interested: 0,
      notGoing: 0,
    };
    if (status === RSVP_GOING) counts.going += count;
    else if (status === RSVP_INTERESTED) counts.interested += count;
    else if (status === RSVP_NOT_GOING) counts.notGoing += count;
    countsByEvent.set(eventId, counts);
  }

  const viewerByEvent = new Map(
    viewerRsvps.map(({ eventId, status }) => [eventId, status]),
  );

  return rows.map((row) =>
    toEventView(
      row,
      artistsByEvent.get(row.events.id) ?? [],
      countsByEvent.get(row.events.id) ?? {
        going: 0,
        interested: 0,
        notGoing: 0,
      },
      viewerByEvent.get(row.events.id),
    ),
  );
}

// Clients build the URI from whatever identifies the actor in the route,
// which is often a handle; stored URIs always carry the DID.
export async function canonicalAtUri(
  ctx: Context,
  uri: string,
): Promise<string> {
  const [authority, collection, rkey] = uri.replace(/^at:\/\//, "").split("/");
  if (!authority || authority.startsWith("did:") || !rkey) return uri;
  const user = await ctx.db
    .select({ did: tables.users.did })
    .from(tables.users)
    .where(eq(tables.users.handle, authority))
    .limit(1)
    .then((rows) => rows[0]);
  return user ? `at://${user.did}/${collection}/${rkey}` : uri;
}

// An event is addressed by either of its records.
export async function findEvent(
  ctx: Context,
  uri: string,
): Promise<EventRow | undefined> {
  const canonical = await canonicalAtUri(ctx, uri);
  return ctx.db
    .select({ events: tables.events, users: tables.users })
    .from(tables.events)
    .innerJoin(tables.users, eq(tables.events.createdBy, tables.users.id))
    .where(
      sql`${tables.events.uri} = ${canonical} OR ${tables.events.musicUri} = ${canonical}`,
    )
    .limit(1)
    .then((rows) => rows[0]);
}

export type EventFilters = {
  artist?: string;
  did?: string;
  rsvpBy?: string;
  kind?: string;
  genre?: string;
  from?: string;
  to?: string;
  includePast?: boolean;
  limit: number;
  offset: number;
};

function parseDate(value: string | undefined, name: string): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new InvalidRequestError(`\`${name}\` is not a valid datetime`);
  }
  return date;
}

// The start of the current UTC day: the default list keeps everything that
// has not expired, and an event that started earlier today still counts.
export function startOfToday(now = new Date()): Date {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

// Without a window the list is "what has not expired": events that end (or,
// lacking an end, start) today or later, plus undated ones, which are
// presumably announced for later. `includePast` flips it into a history.
function eventConditions(filters: EventFilters) {
  const from = parseDate(filters.from, "from");
  const to = parseDate(filters.to, "to");
  const upcomingOnly = !from && !to && !filters.includePast;
  const lowerBound = from ?? (upcomingOnly ? startOfToday() : undefined);

  const notEndedBefore = (bound: Date) =>
    or(
      isNull(tables.events.startsAt),
      sql`coalesce(${tables.events.endsAt}, ${tables.events.startsAt}) >= ${bound}`,
    );

  // An artist is addressed the way the rest of the API does it (AT-URI),
  // with the row id and content hash accepted as well.
  const artistMatches = (artist: string) =>
    exists(
      sql`(SELECT 1 FROM ${tables.eventArtists}
            JOIN ${tables.artists} ON ${tables.artists.id} = ${tables.eventArtists.artistId}
           WHERE ${tables.eventArtists.eventId} = ${tables.events.id}
             AND (${tables.artists.uri} = ${artist}
               OR ${tables.artists.id} = ${artist}
               OR ${tables.artists.sha256} = ${artist}))`,
    );

  const rsvpBy = (did: string) =>
    exists(
      sql`(SELECT 1 FROM ${tables.eventRsvps}
            JOIN ${tables.users} AS attendee ON attendee.xata_id = ${tables.eventRsvps.userId}
           WHERE ${tables.eventRsvps.eventId} = ${tables.events.id}
             AND attendee.did = ${did}
             AND ${tables.eventRsvps.status} IN (${RSVP_GOING}, ${RSVP_INTERESTED}))`,
    );

  return {
    where: and(
      filters.artist ? artistMatches(filters.artist) : undefined,
      filters.did ? eq(tables.users.did, filters.did) : undefined,
      filters.rsvpBy ? rsvpBy(filters.rsvpBy) : undefined,
      filters.kind ? eq(tables.events.kind, filters.kind) : undefined,
      filters.genre
        ? sql`lower(${tables.events.genre}) = lower(${filters.genre})`
        : undefined,
      lowerBound ? notEndedBefore(lowerBound) : undefined,
      to ? sql`${tables.events.startsAt} <= ${to}` : undefined,
    ),
    // Upcoming lists read soonest first; a history reads most recent first.
    // Raw SQL only for NULLS LAST, which drizzle's asc/desc helpers omit.
    order:
      filters.includePast && !from
        ? sql`${tables.events.startsAt} DESC NULLS LAST`
        : sql`${tables.events.startsAt} ASC NULLS LAST`,
  };
}

export async function listEvents(
  ctx: Context,
  filters: EventFilters,
  viewer?: string,
): Promise<EventView[]> {
  const { where, order } = eventConditions(filters);
  const rows = await ctx.db
    .select({ events: tables.events, users: tables.users })
    .from(tables.events)
    .innerJoin(tables.users, eq(tables.events.createdBy, tables.users.id))
    .where(where)
    .orderBy(order, asc(tables.events.id))
    .limit(filters.limit)
    .offset(filters.offset)
    .execute();
  return hydrateEvents(ctx, rows, viewer);
}
