import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/db/row
import rocksky_api/lexicon/models
import rocksky_api/node/js
import rocksky_api/schema/artists.{type Artist}
import rocksky_api/schema/event_artists.{type EventArtist}
import rocksky_api/schema/event_rsvps.{type EventRsvp}
import rocksky_api/schema/events.{type Event}
import rocksky_api/schema/users.{type User}

fn string_field(raw: Dynamic, name: String) {
  decode.run(raw, decode.field(name, decode.string, decode.success))
  |> option.from_result
}

fn child(raw: Dynamic, name: String) {
  decode.run(raw, decode.field(name, decode.dynamic, decode.success))
  |> result.unwrap(js.null())
}

fn positive(raw: Dynamic, name: String) {
  case decode.run(raw, decode.field(name, decode.int, decode.success)) {
    Ok(n) if n > 0 -> Some(n)
    _ -> None
  }
}

pub fn nonempty(value: String) {
  case value {
    "" -> None
    _ -> Some(value)
  }
}

pub fn location(raw: Dynamic) {
  use kind <- option.then(string_field(raw, "$type"))
  let base =
    models.EventLocationView(
      ..models.new_event_location_view(kind),
      name: string_field(raw, "name"),
    )
  case kind {
    "community.lexicon.location.address" ->
      Some(
        models.EventLocationView(
          ..base,
          country: string_field(raw, "country"),
          postal_code: string_field(raw, "postalCode"),
          region: string_field(raw, "region"),
          locality: string_field(raw, "locality"),
          street: string_field(raw, "street"),
        ),
      )
    "community.lexicon.location.geo" ->
      Some(
        models.EventLocationView(
          ..base,
          latitude: string_field(raw, "latitude"),
          longitude: string_field(raw, "longitude"),
          altitude: string_field(raw, "altitude"),
        ),
      )
    "community.lexicon.location.fsq" ->
      Some(
        models.EventLocationView(
          ..base,
          fsq_place_id: string_field(raw, "fsq_place_id"),
          latitude: string_field(raw, "latitude"),
          longitude: string_field(raw, "longitude"),
        ),
      )
    "community.lexicon.location.hthree" ->
      Some(models.EventLocationView(..base, h3: string_field(raw, "value")))
    "community.lexicon.calendar.event#uri" ->
      Some(models.EventLocationView(..base, uri: string_field(raw, "uri")))
    _ -> None
  }
}

pub fn media(raw: Dynamic, did: String) {
  let content = child(raw, "content")
  use cid <- option.then(
    string_field(child(content, "ref"), "$link") |> option.then(nonempty),
  )
  use role <- option.then(string_field(raw, "role") |> option.then(nonempty))
  let ratio = child(raw, "aspect_ratio")
  Some(models.EventMediaView(
    role: role,
    cid: cid,
    url: "https://cdn.bsky.app/img/feed_fullsize/plain/"
      <> did
      <> "/"
      <> cid
      <> "@jpeg",
    mime_type: option.unwrap(
      string_field(content, "mimeType"),
      "application/octet-stream",
    ),
    size: positive(content, "size"),
    width: positive(ratio, "width"),
    height: positive(ratio, "height"),
    alt: string_field(raw, "alt"),
  ))
}

fn uri(raw: Dynamic) {
  use uri <- option.then(string_field(raw, "uri") |> option.then(nonempty))
  Some(models.EventUriView(uri: uri, name: string_field(raw, "name")))
}

fn items(raw: Option(Dynamic), convert: fn(Dynamic) -> Option(a)) {
  case raw {
    None -> []
    Some(value) ->
      decode.run(value, decode.list(decode.dynamic))
      |> result.unwrap([])
      |> list.filter_map(fn(v) { convert(v) |> option.to_result(Nil) })
  }
}

pub fn artist(entry: EventArtist, artist: Option(Artist)) {
  models.EventArtistView(
    id: option.map(artist, fn(a) { a.id }),
    uri: option.then(artist, fn(a) { a.uri }),
    sha256: option.map(artist, fn(a) { a.sha256 }),
    name: entry.name,
    picture: option.then(artist, fn(a) { a.picture }),
    mbid: entry.mbid,
    role: entry.role,
    stage: entry.stage,
    starts_at: option.map(entry.starts_at, row.iso8601),
  )
}

pub fn rsvp(entry: EventRsvp, user: User) {
  models.EventRsvpView(
    uri: entry.uri,
    cid: entry.cid,
    status: entry.status,
    did: user.did,
    handle: user.handle,
    display_name: option.unwrap(user.display_name, ""),
    avatar: nonempty(user.avatar),
    created_at: row.iso8601(entry.created_at),
  )
}

pub fn view(event: Event, organizer: User, artists, counts, viewer) {
  let media = items(event.media, media(_, organizer.did))
  let thumbnail =
    list.find(media, fn(m) { m.role == "thumbnail" })
    |> result.or(list.first(media))
    |> option.from_result
  let image = case event.image_url {
    Some(_) -> event.image_url
    None -> option.map(thumbnail, fn(m) { m.url })
  }
  models.EventView(
    id: event.id,
    uri: event.uri,
    cid: event.cid,
    music_uri: event.music_uri,
    music_cid: event.music_cid,
    name: event.name,
    description: event.description,
    kind: event.kind,
    genre: event.genre,
    tags: event.tags,
    starts_at: option.map(event.starts_at, row.iso8601),
    ends_at: option.map(event.ends_at, row.iso8601),
    mode: event.mode,
    status: event.status,
    image_url: image,
    media: Some(media),
    tickets_url: event.tickets_url,
    locations: items(event.locations, location),
    uris: items(event.uris, uri),
    artists: artists,
    external_ids: option.then(event.external_ids, fn(raw) {
      decode.run(raw, models.music_external_ids_decoder()) |> option.from_result
    }),
    organizer_did: organizer.did,
    organizer_handle: Some(organizer.handle),
    organizer_name: organizer.display_name,
    organizer_avatar_url: nonempty(organizer.avatar),
    rsvp_counts: counts,
    viewer_rsvp: viewer,
    created_at: row.iso8601(option.unwrap(
      event.created_at,
      event.xata_created_at,
    )),
    updated_at: row.iso8601(event.updated_at),
  )
}
