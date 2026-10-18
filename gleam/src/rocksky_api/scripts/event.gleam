import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, eq, eq_columns, equals_case_insensitive, field, inner_join, is_null,
  limit, nullable, one, pair, select, utc_calendar_day, where,
}
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/event_artists as ea
import rocksky_api/drizzle/schema/events as ev
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/log
import rocksky_api/node/http_fetch
import rocksky_api/node/js
import rocksky_api/node/prompts
import rocksky_api/node/sharp
import rocksky_api/node/web_url
import rocksky_api/scripts/common
import rocksky_api/task

const calendar_nsid = "community.lexicon.calendar.event"

const music_nsid = "app.rocksky.event.music"

pub type Artist {
  Artist(
    name: String,
    uri: Option(String),
    role: String,
    stage: Option(String),
    starts_at: Option(String),
    mbid: Option(String),
  )
}

pub type Draft {
  Draft(
    name: String,
    description: Option(String),
    starts_at: String,
    ends_at: Option(String),
    mode: String,
    status: String,
    locations: List(json.Json),
    website: Option(String),
    kind: String,
    genre: Option(String),
    tags: List(String),
    artists: List(Artist),
    external_ids: List(#(String, String)),
    tickets_url: Option(String),
    image_url: Option(String),
    created_at: String,
  )
}

fn optional(value: String) {
  case value {
    "" -> None
    _ -> Some(value)
  }
}

fn field_optional(key: String, value: Option(String)) {
  case value {
    None -> []
    Some(v) -> [#(key, json.string(v))]
  }
}

fn ask(message: String, initial: Option(String)) {
  prompts.text_initial(message, initial)
  |> task.attempt_result
  |> task.require_task("Event creation cancelled")
  |> task.map(string.trim)
}

fn text(message: String) {
  ask(message, None)
}

fn choose(message: String, choices: List(#(String, String)), initial: Int) {
  prompts.choose(message, choices, initial)
  |> task.attempt_result
  |> task.require_task("Event creation cancelled")
}

fn datetime(message: String, required: Bool) {
  use value <- task.then(text(message))
  case value == "" && !required {
    True -> task.ok(None)
    False ->
      case js.parse_date_ms(value) {
        Some(ms) -> task.ok(Some(row.iso8601(row.from_unix_ms(ms))))
        None -> {
          log.warn("Not a date. Use ISO-8601, e.g. 2026-12-01T20:00:00+01:00")
          datetime(message, required)
        }
      }
  }
}

fn mime_extension(ext: String) {
  case ext {
    "jpeg" | "jpg" -> Some("image/jpeg")
    "png" -> Some("image/png")
    "webp" -> Some("image/webp")
    "gif" -> Some("image/gif")
    "avif" -> Some("image/avif")
    _ -> None
  }
}

fn content_type(value: Option(String)) {
  value
  |> option.map(fn(v) {
    string.split(v, ";")
    |> list.first
    |> result.unwrap("")
    |> string.trim
    |> string.lowercase
  })
}

pub fn image_type(value: String) {
  case web_url.parse(value) {
    Error(_) -> task.ok(None)
    Ok(url) ->
      case
        web_url.protocol(url) == "http:" || web_url.protocol(url) == "https:"
      {
        False -> task.ok(None)
        True -> {
          let fallback =
            web_url.pathname(url)
            |> string.lowercase
            |> string.split(".")
            |> list.last
            |> result.unwrap("")
            |> mime_extension
          let work = {
            use response <- task.map(
              http_fetch.request(value, "HEAD", [], None) |> task.attempt_result,
            )
            let mime = content_type(http_fetch.header(response, "content-type"))
            case mime {
              Some(mime)
                if mime == "image/jpeg"
                || mime == "image/png"
                || mime == "image/webp"
                || mime == "image/gif"
                || mime == "image/avif"
              -> Some(mime)
              Some(mime) if mime != "" ->
                case
                  http_fetch.status(response) >= 200
                  && http_fetch.status(response) < 300
                {
                  True -> None
                  False -> fallback
                }
              _ -> fallback
            }
          }
          work |> task.rescue(fn(_) { task.ok(fallback) })
        }
      }
  }
}

fn picture_url() {
  use url <- task.then(text("Poster image URL (optional)"))
  case url {
    "" -> task.ok(None)
    _ -> {
      use mime <- task.then(image_type(url))
      case mime {
        Some(_) -> task.ok(Some(url))
        None -> {
          log.warn("Not a picture URL. Expected jpeg, png, webp, gif or avif.")
          picture_url()
        }
      }
    }
  }
}

fn locations(mode: String) {
  use places <- task.then(case mode == calendar_nsid <> "#virtual" {
    True -> task.ok([])
    False -> {
      use venue <- task.then(text("Venue name"))
      use country <- task.then(text("Country (ISO 3166 code, e.g. FR)"))
      use _ <- task.then(case string.length(country) >= 2 {
        True -> task.ok(Nil)
        False ->
          task.fail(error.InvalidRequest(
            "A venue needs at least a country code.",
          ))
      })
      use city <- task.then(text("City (optional)"))
      use region <- task.then(text("Region / state (optional)"))
      use street <- task.then(text("Street address (optional)"))
      use postal <- task.then(text("Postal code (optional)"))
      use latitude <- task.then(text("Latitude (optional)"))
      use longitude <- task.map(text("Longitude (optional)"))
      let address =
        json.object([
          #("$type", json.string("community.lexicon.location.address")),
          #("country", json.string(string.uppercase(country))),
          ..list.flatten([
            field_optional("name", optional(venue)),
            field_optional("locality", optional(city)),
            field_optional("region", optional(region)),
            field_optional("street", optional(street)),
            field_optional("postalCode", optional(postal)),
          ])
        ])
      case latitude != "" && longitude != "" {
        False -> [address]
        True -> [
          address,
          json.object([
            #("$type", json.string("community.lexicon.location.geo")),
            #("latitude", json.string(latitude)),
            #("longitude", json.string(longitude)),
            ..field_optional("name", optional(venue))
          ]),
        ]
      }
    }
  })
  case mode == calendar_nsid <> "#inperson" {
    True -> task.ok(places)
    False -> {
      use url <- task.map(text("Stream / online venue URL"))
      case url {
        "" -> places
        _ ->
          list.append(places, [
            json.object([
              #("$type", json.string(calendar_nsid <> "#uri")),
              #("uri", json.string(url)),
              #("name", json.string("Online")),
            ]),
          ])
      }
    }
  }
}

fn lineup(ctx: Context, kind: String, artists: List(Artist)) {
  use name <- task.then(
    text(case artists {
      [] -> "Artist name (headliner)"
      _ -> "Next artist (leave empty to finish)"
    }),
  )
  case name, artists {
    "", [] ->
      task.fail(error.InvalidRequest("A music event needs at least one artist."))
    "", _ -> task.ok(artists)
    _, _ -> {
      let table = ar.table()
      use known <- task.then(
        select(table, field("uri", ar.uri(table)))
        |> where(equals_case_insensitive(nullable(ar.name(table)), name))
        |> one(ctx.db),
      )
      use uri <- task.then(ask(
        "Artist AT-URI (optional)",
        option.flatten(known),
      ))
      use role <- task.then(
        choose(
          "Role",
          [
            #("Headliner", "headliner"),
            #("Support", "support"),
            #("Opener", "opener"),
            #("DJ", "dj"),
            #("Special guest", "special-guest"),
            #("Performer", "performer"),
          ],
          case artists {
            [] -> 0
            _ -> 1
          },
        ),
      )
      use stage <- task.then(case kind {
        "festival" -> text("Stage (optional)")
        _ -> task.ok("")
      })
      use time <- task.then(datetime("Set time (ISO-8601, optional)", False))
      use mbid <- task.then(text("MusicBrainz artist id (optional)"))
      lineup(
        ctx,
        kind,
        list.append(artists, [
          Artist(
            name,
            optional(uri),
            role,
            optional(stage),
            time,
            optional(mbid),
          ),
        ]),
      )
    }
  }
}

pub fn collect(ctx: Context) {
  use name <- task.then(text("Event name"))
  use _ <- task.then(case name {
    "" -> task.fail(error.InvalidRequest("The event needs a name."))
    _ -> task.ok(Nil)
  })
  use description <- task.then(text("Description (optional)"))
  use starts <- task.then(
    datetime("Starts at (ISO-8601)", True)
    |> task.require_task("Start time required"),
  )
  use ends <- task.then(datetime("Ends at (ISO-8601, optional)", False))
  use mode <- task.then(choose(
    "Attendance mode",
    [
      #("In person", calendar_nsid <> "#inperson"),
      #("Virtual", calendar_nsid <> "#virtual"),
      #("Hybrid", calendar_nsid <> "#hybrid"),
    ],
    0,
  ))
  use status <- task.then(choose(
    "Status",
    list.map(
      ["scheduled", "planned", "rescheduled", "postponed", "cancelled"],
      fn(v) { #(v, calendar_nsid <> "#" <> v) },
    ),
    0,
  ))
  use locations <- task.then(locations(mode))
  use website <- task.then(text("Event website (optional)"))
  use kind <- task.then(choose(
    "Kind of event",
    list.map(
      [
        "concert",
        "festival",
        "club-night",
        "dj-set",
        "livestream",
        "release-party",
        "listening-party",
      ],
      fn(v) { #(v, v) },
    ),
    0,
  ))
  use genre <- task.then(text("Main genre (optional)"))
  use tags <- task.then(text("Tags, comma-separated (optional)"))
  use artists <- task.then(lineup(ctx, kind, []))
  use external <- task.then(
    task.each(
      [
        #("ticketmaster", "Ticketmaster"),
        #("songkick", "Songkick"),
        #("bandsintown", "Bandsintown"),
        #("residentAdvisor", "Resident Advisor"),
        #("setlistfm", "setlist.fm"),
        #("dice", "DICE"),
        #("eventbrite", "Eventbrite"),
      ],
      fn(pair) {
        use value <- task.map(text(pair.1 <> " event id (optional)"))
        #(pair.0, value)
      },
    ),
  )
  use tickets <- task.then(text("Tickets URL (optional)"))
  use image <- task.map(picture_url())
  Draft(
    name,
    optional(description),
    starts,
    ends,
    mode,
    status,
    locations,
    optional(website),
    kind,
    optional(genre),
    string.split(tags, ",")
      |> list.map(string.trim)
      |> list.filter(fn(t) { t != "" }),
    artists,
    list.filter(external, fn(p) { p.1 != "" }),
    optional(tickets),
    image,
    row.iso8601(row.from_unix_ms(js.now_ms())),
  )
}

pub fn similar(ctx: Context, draft: Draft) {
  let events = ev.table()
  let artists = ea.table()
  let headliner =
    list.first(draft.artists)
    |> result.map(fn(a) { a.name })
    |> result.unwrap("")
  select(
    events,
    pair(field("name", ev.name(events)), field("uri", ev.uri(events))),
  )
  |> inner_join(artists, eq_columns(ea.event_id(artists), ev.id(events)))
  |> where(
    and([
      is_null(ev.duplicate_of(events)),
      eq(ea.position(artists), 0),
      equals_case_insensitive(nullable(ea.name(artists)), headliner),
      eq(
        utc_calendar_day(ev.starts_at(events)),
        Some(string.slice(draft.starts_at, 0, 10)),
      ),
    ]),
  )
  |> limit(5)
  |> all(ctx.db)
}

pub fn calendar_record(draft: Draft, media: Option(json.Json)) {
  json.object([
    #("$type", json.string(calendar_nsid)),
    #("name", json.string(draft.name)),
    #("createdAt", json.string(draft.created_at)),
    #("startsAt", json.string(draft.starts_at)),
    #("mode", json.string(draft.mode)),
    #("status", json.string(draft.status)),
    #("locations", json.array(draft.locations, fn(j) { j })),
    #(
      "uris",
      json.array(
        case draft.website {
          None -> []
          Some(url) -> [
            json.object([
              #("uri", json.string(url)),
              #("name", json.string("Website")),
            ]),
          ]
        },
        fn(j) { j },
      ),
    ),
    ..list.flatten([
      field_optional("description", draft.description),
      field_optional("endsAt", draft.ends_at),
      case media {
        None -> []
        Some(media) -> [#("media", json.array([media], fn(j) { j }))]
      },
    ])
  ])
}

pub fn music_record(draft: Draft, subject: Option(atp.RecordRef)) {
  json.object([
    #("$type", json.string(music_nsid)),
    #("kind", json.string(draft.kind)),
    #("createdAt", json.string(draft.created_at)),
    #(
      "artists",
      json.array(draft.artists, fn(a) {
        json.object([
          #("name", json.string(a.name)),
          #("role", json.string(a.role)),
          ..list.flatten([
            field_optional("uri", a.uri),
            field_optional("stage", a.stage),
            field_optional("startsAt", a.starts_at),
            field_optional("mbid", a.mbid),
          ])
        ])
      }),
    ),
    ..list.flatten([
      field_optional("genre", draft.genre),
      field_optional("ticketsUrl", draft.tickets_url),
      field_optional("imageUrl", draft.image_url),
      case subject {
        None -> []
        Some(ref) -> [
          #(
            "subject",
            json.object([
              #("uri", json.string(ref.uri)),
              #("cid", json.string(ref.cid)),
            ]),
          ),
        ]
      },
      case draft.tags {
        [] -> []
        tags -> [#("tags", json.array(tags, json.string))]
      },
      case draft.external_ids {
        [] -> []
        pairs -> [
          #(
            "externalIds",
            json.object(list.map(pairs, fn(p) { #(p.0, json.string(p.1)) })),
          ),
        ]
      },
    ])
  ])
}

pub fn upload_poster(agent: atp.Agent, name: String, url: String) {
  use response <- task.then(
    http_fetch.request(url, "GET", [], None) |> task.attempt_result,
  )
  case http_fetch.status(response) >= 200 && http_fetch.status(response) < 300 {
    False -> {
      log.warn("Poster download failed; publishing without it")
      task.ok(None)
    }
    True -> {
      use bytes <- task.then(http_fetch.bytes(response) |> task.attempt_result)
      use metadata <- task.then(sharp.metadata(bytes) |> task.attempt_result)
      case metadata.width, metadata.height, metadata.format {
        Some(width), Some(height), Some(format)
          if width > 0 && height > 0 && format != ""
        -> {
          let mime =
            content_type(http_fetch.header(response, "content-type"))
            |> option.unwrap(
              "image/"
              <> case format {
                "jpg" -> "jpeg"
                _ -> format
              },
            )
          use blob <- task.map(
            atp.upload_blob(agent, bytes, mime) |> task.attempt_result,
          )
          Some(
            json.object([
              #("$type", json.string(calendar_nsid <> "#media")),
              #("role", json.string("thumbnail")),
              #("alt", json.string(name)),
              #("content", row.dynamic_to_json(blob)),
              #(
                "aspect_ratio",
                json.object([
                  #("width", json.int(width)),
                  #("height", json.int(height)),
                ]),
              ),
            ]),
          )
        }
        _, _, _ -> {
          log.warn("Poster is not a readable image; publishing without it")
          task.ok(None)
        }
      }
    }
  }
}

pub fn publish(agent: atp.Agent, did: String, draft: Draft) {
  use media <- task.then(case draft.image_url {
    None -> task.ok(None)
    Some(url) -> upload_poster(agent, draft.name, url)
  })
  use calendar <- task.then(
    atp.create_record(
      agent,
      did,
      calendar_nsid,
      None,
      calendar_record(draft, media),
    )
    |> task.attempt_result,
  )
  atp.create_record(
    agent,
    did,
    music_nsid,
    None,
    music_record(draft, Some(calendar)),
  )
  |> task.attempt_result
}

pub fn execute(ctx: Context, args: List(String)) {
  let work = case args {
    [] -> task.fail(error.InvalidRequest("Usage: event <handle|did>"))
    [actor, ..] -> {
      use draft <- task.then(collect(ctx))
      use similar <- task.then(similar(ctx, draft))
      use proceed <- task.then(case similar {
        [] -> task.ok(True)
        _ -> {
          list.each(similar, fn(p) {
            log.warn("Similar event: " <> p.0 <> " " <> p.1)
          })
          prompts.confirm("Publish anyway?", False) |> task.attempt_result
        }
      })
      case proceed {
        False -> task.ok(Nil)
        True -> {
          log.info(json.to_string(calendar_record(draft, None)))
          log.info(json.to_string(music_record(draft, None)))
          use confirmed <- task.then(
            prompts.confirm("Do you want to proceed?", True)
            |> task.attempt_result,
          )
          case confirmed {
            False -> task.ok(Nil)
            True -> {
              use did <- task.then(common.actor(ctx, actor))
              use agent <- task.then(agent.require(ctx, did))
              use record <- task.map(publish(agent, did, draft))
              log.success("Event created at: " <> record.uri)
            }
          }
        }
      }
    }
  }
  work
  |> task.rescue(fn(e) {
    case error.to_string(e) {
      "Event creation cancelled" -> {
        log.info("Event creation cancelled")
        task.ok(Nil)
      }
      _ -> task.fail(e)
    }
  })
}

pub fn main() {
  common.run(execute)
}
