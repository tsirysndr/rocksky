# Publishing a music event

`bun event -- <handle|did>` writes two records into the publisher's repo:

- a `community.lexicon.calendar.event` with the name, dates and venue, the
  same record any calendar app can read
- an `app.rocksky.event.music` that points at it and adds what is specific
  to music: the kind of event, the genre and the lineup

Jetstream indexes the pair, links every billed artist to their Rocksky
page, and the event shows up in `app.rocksky.event.getEvents`, on each
artist's `app.rocksky.artist.getArtistEvents`, and to anyone who RSVPs
with a `community.lexicon.calendar.rsvp`. A calendar event without the
music record is left alone, so other events in the same repo never show
up as concerts.

## Prerequisites

- `apps/api` configured (database and OAuth client): the script writes
  through the API's own agent
- The publisher has signed in to Rocksky at least once, so an OAuth
  session exists for their DID
- The publisher's DID is in the appview's `EVENT_PUBLISHER_DIDS` (by
  default `tsiry-sandratraina.com` and `rocksky.app`), or Jetstream ignores
  the records

## Example

The show to list:

```
Concert
Slipknot
Wembley Stadium
London, United Kingdom
Sat, Jul 3, 2027 · 7:00 PM
```

Run the script from `apps/api` with the publisher's handle or DID:

```sh
cd apps/api
bun event -- rocksky.app
```

It asks for every field in turn. Dates are ISO-8601 with an offset, so
7:00 PM in London in July (BST) is `2027-07-03T19:00:00+01:00`. Leave an
optional answer empty to skip it.

```
? Event name › Slipknot at Wembley Stadium
? Description (optional) › Slipknot headline Wembley Stadium.
? Starts at (ISO-8601) › 2027-07-03T19:00:00+01:00
? Ends at (ISO-8601, optional) › 2027-07-03T23:00:00+01:00
? Attendance mode › In person
? Status › Scheduled
? Venue name › Wembley Stadium
? Country (ISO 3166 code, e.g. FR) › GB
? City (optional) › London
? Region / state (optional) › England
? Street address (optional) › London HA9 0WS
? Postal code (optional) › HA9 0WS
? Latitude (optional) › 51.5560
? Longitude (optional) › -0.2796
? Event website (optional) › https://www.wembleystadium.com/events
? Kind of event › Concert
? Main genre (optional) › Metal
? Tags, comma-separated (optional) › nu metal, stadium
? Artist name (headliner) › Slipknot
ℹ Linked to at://did:plc:…/app.rocksky.artist/…
? Artist AT-URI (optional) › at://did:plc:…/app.rocksky.artist/…
? Role › Headliner
? Set time (ISO-8601, optional) ›
? MusicBrainz artist id (optional) › a466c2a2-6517-42fb-a160-1087c3bafd9f
? Next artist (leave empty to finish) ›
? Ticketmaster event id (optional) › 1A00ZK9GDF1234
? Songkick event id (optional) ›
? Bandsintown event id (optional) ›
? Resident Advisor event id (optional) ›
? setlist.fm event id (optional) ›
? DICE event id (optional) ›
? Eventbrite event id (optional) ›
? Tickets URL (optional) › https://www.ticketmaster.co.uk/slipknot-tickets
? Poster image URL (optional) › https://media.bandsintown.com/900x900/26140291.webp
```

When a billed name matches an artist Rocksky already knows, the script
fills in the artist's AT-URI, which is what links the event to that
artist's page. For a festival, each artist is also asked for a stage.

Both records are then printed as JSON for a last look:

```
ℹ Creating event with the following details:
{
  "$type": "community.lexicon.calendar.event",
  "name": "Slipknot at Wembley Stadium",
  "startsAt": "2027-07-03T18:00:00.000Z",
  "endsAt": "2027-07-03T22:00:00.000Z",
  "mode": "community.lexicon.calendar.event#inperson",
  "status": "community.lexicon.calendar.event#scheduled",
  "locations": [
    {
      "$type": "community.lexicon.location.address",
      "name": "Wembley Stadium",
      "country": "GB",
      "locality": "London",
      ...
    }
  ],
  ...
}
{
  "$type": "app.rocksky.event.music",
  "kind": "concert",
  "genre": "Metal",
  "artists": [{ "name": "Slipknot", "role": "headliner", ... }],
  "externalIds": { "ticketmaster": "1A00ZK9GDF1234" },
  "ticketsUrl": "https://www.ticketmaster.co.uk/slipknot-tickets",
  "imageUrl": "https://media.bandsintown.com/900x900/26140291.webp",
  ...
}
? Do you want to proceed? › yes
ℹ Writing community.lexicon.calendar.event record...
ℹ Record created at: at://did:plc:…/community.lexicon.calendar.event/3m2…
ℹ Writing app.rocksky.event.music record...
✔ Event created successfully!
ℹ Record created at: at://did:plc:…/app.rocksky.event.music/3m2…
```

Within a few seconds Jetstream has indexed it:

```sh
curl "https://api.rocksky.app/xrpc/app.rocksky.event.getEvents?genre=metal"
```

If Slipknot already has an event on that day, the script says so before
publishing. Publishing anyway is allowed, but the appview folds the new
records onto the existing event as a duplicate: only the first one is
listed, and RSVPs to either count together.

## Changing or removing an event

Records are the source of truth and Jetstream mirrors every change:

- Edit the calendar record (a new date, a cancelled status, another venue)
  and the event updates. Rocksky never rewrites your records.
- Edit the music record to change the lineup, genre or external ids.
- Delete the `app.rocksky.event.music` record to take the event off
  Rocksky while keeping the calendar event for other apps. Deleting the
  calendar record removes it as well.
