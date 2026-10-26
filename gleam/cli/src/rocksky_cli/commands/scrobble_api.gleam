import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/commands/import_history
import rocksky_cli/commands/reads
import rocksky_cli/commands/scrobble
import rocksky_cli/http
import rocksky_cli/node
import rocksky_cli/sdk
import rocksky_cli/value

pub type Config {
  Config(
    api_key: String,
    secret: String,
    session: String,
    web_key: String,
    handle: String,
  )
}

fn env(name: String) -> String {
  case node.env(name) {
    "" -> node.random_hex(16)
    x -> x
  }
}

pub fn config() -> Config {
  Config(
    env("ROCKSKY_API_KEY"),
    env("ROCKSKY_SHARED_SECRET"),
    env("ROCKSKY_SESSION_KEY"),
    env("ROCKSKY_WEBSCROBBLER_KEY"),
    case node.env("ROCKSKY_IDENTIFIER") {
      "" -> node.env("ROCKSKY_HANDLE")
      x -> x
    },
  )
}

pub fn signature(params: Dynamic, secret: String) -> String {
  value.entries(params)
  |> list.filter(fn(p) {
    !list.contains(["api_sig", "format", "callback"], p.0)
  })
  |> list.sort(fn(a, b) { string.compare(a.0, b.0) })
  |> list.map(fn(p) { p.0 <> value.text(p.1) })
  |> string.join("")
  |> fn(text) { node.hash(text <> secret, "md5") }
}

fn json(status: Int, body: json.Json) -> http.Response {
  http.Response(status, json.to_string(body), "application/json")
}

fn text(status: Int, body: String) -> http.Response {
  http.Response(status, body, "text/plain; charset=utf-8")
}

fn error(code: Int, message: String) -> http.Response {
  json(
    200,
    json.object([#("error", json.int(code)), #("message", json.string(message))]),
  )
}

pub fn run(options: Dynamic) -> promise.Promise(Nil) {
  use auth <- promise.await(import_history.authenticate())
  case auth {
    Error(e) -> {
      reads.fail(e)
      promise.resolve(Nil)
    }
    Ok(agent) -> {
      use opened <- promise.await(sdk.open_index(
        agent,
        node.state_path("import-index"),
        sdk.play_key,
      ))
      case opened {
        Error(e) -> {
          reads.fail(e)
          promise.resolve(Nil)
        }
        Ok(index) -> {
          use synced <- promise.await(sdk.sync(agent))
          case synced {
            Error(e) -> {
              reads.fail(e)
              sdk.close(index)
            }
            Ok(_) -> {
              let config = config()
              let subscription = sdk.hydrate(agent)
              node.print(
                "Scrobble API listening on port "
                <> int.to_string(value.integer(options, "port", 8778)),
              )
              node.print(
                "ROCKSKY_API_KEY="
                <> config.api_key
                <> "\nROCKSKY_SHARED_SECRET="
                <> config.secret
                <> "\nROCKSKY_SESSION_KEY="
                <> config.session
                <> "\nROCKSKY_WEBSCROBBLER_KEY="
                <> config.web_key,
              )
              http.serve(
                value.integer(options, "port", 8778),
                fn(request) {
                  handle(config, request, fn(track) {
                    use outcome <- promise.map(sdk.publish(
                      agent,
                      index,
                      track,
                      import_history.fallback,
                    ))
                    case outcome {
                      Ok(_) -> Nil
                      Error(e) -> node.error(import_history.error_text(e))
                    }
                  })
                },
                fn() {
                  use _ <- promise.await(sdk.stop(subscription))
                  sdk.close(index)
                },
              )
            }
          }
        }
      }
    }
  }
}

pub fn handle(
  config: Config,
  request: Dynamic,
  publish: fn(Dynamic) -> promise.Promise(Nil),
) -> promise.Promise(http.Response) {
  let path = value.string(request, "path")
  let method = value.string(request, "method")
  let body = value.field(request, "body")
  let authorization = value.string(request, "authorization")
  case path {
    "/" ->
      promise.resolve(text(
        200,
        "Welcome to the lastfm/listenbrainz/webscrobbler compatibility API\n",
      ))
    "/2.0" -> {
      let params = case method {
        "GET" -> value.field(request, "query")
        _ -> body
      }
      lastfm(config, params, publish)
    }
    "/nowplaying" | "/submission" -> {
      case value.string(body, "s") == config.session {
        False -> promise.resolve(text(200, "BADSESSION\n"))
        True ->
          case path {
            "/nowplaying" -> promise.resolve(text(200, "OK\n"))
            _ -> {
              let title = value.string(body, "t[0]")
              let artist = value.string(body, "a[0]")
              case title == "" || artist == "" {
                True -> promise.resolve(text(200, "FAILED Invalid request\n"))
                False -> {
                  let _ =
                    publish(scrobble.input(
                      title,
                      artist,
                      value.string(body, "b[0]"),
                      value.integer(body, "i[0]", node.now()),
                    ))
                  promise.resolve(text(200, "OK\n"))
                }
              }
            }
          }
      }
    }
    "/1/validate-token" ->
      promise.resolve(json(
        200,
        json.object([
          #(
            "code",
            json.int(case authorization == "Token " <> config.api_key {
              True -> 200
              False -> 401
            }),
          ),
          #("valid", json.bool(authorization == "Token " <> config.api_key)),
          #("user_name", json.string(config.handle)),
          #(
            "message",
            json.string(case authorization == "Token " <> config.api_key {
              True -> "Token valid."
              False -> "Invalid token"
            }),
          ),
          #(
            "permissions",
            json.array(
              ["recording-metadata-write", "recording-metadata-read"],
              json.string,
            ),
          ),
        ]),
      ))
    "/1/submit-listens" -> {
      case authorization == "Token " <> config.api_key {
        False ->
          promise.resolve(json(
            401,
            json.object([
              #("code", json.int(401)),
              #("error", json.string("Unauthorized")),
            ]),
          ))
        True -> {
          case value.string(body, "listen_type") {
            "single" -> {
              let payload = value.field(body, "payload") |> value.items
              let valid =
                payload != []
                && list.all(payload, fn(listen) {
                  value.at(listen, ["track_metadata", "track_name"])
                  |> value.text
                  != ""
                  && value.at(listen, ["track_metadata", "artist_name"])
                  |> value.text
                  != ""
                })
              case valid {
                False -> promise.resolve(text(400, "Invalid request body"))
                True -> {
                  list.each(payload, fn(listen) {
                    let metadata = value.field(listen, "track_metadata")
                    let _ =
                      publish(scrobble.input(
                        value.string(metadata, "track_name"),
                        value.string(metadata, "artist_name"),
                        value.string(metadata, "release_name"),
                        value.integer(listen, "listened_at", node.now()),
                      ))
                    Nil
                  })
                  promise.resolve(json(
                    200,
                    json.object([
                      #("status", json.string("ok")),
                      #("code", json.int(200)),
                    ]),
                  ))
                }
              }
            }
            "playing_now" | "import" ->
              promise.resolve(json(
                200,
                json.object([
                  #("status", json.string("ok")),
                  #("code", json.int(200)),
                  #(
                    "payload",
                    json.object([
                      #("submitted_listens", json.int(0)),
                      #("ignored_listens", json.int(1)),
                    ]),
                  ),
                ]),
              ))
            _ -> promise.resolve(text(400, "Invalid listen_type"))
          }
        }
      }
    }
    "/webscrobbler/" <> key ->
      case key == config.web_key {
        False -> promise.resolve(text(401, "Invalid UUID"))
        True -> {
          let song = value.at(body, ["data", "song", "parsed"])
          let title = value.string(song, "track")
          let artist = value.string(song, "artist")
          case title == "" || artist == "" {
            True -> promise.resolve(text(400, "Invalid request body"))
            False -> {
              use _ <- promise.map(
                publish(scrobble.input(
                  title,
                  artist,
                  value.string(song, "album"),
                  value.integer(body, "time", node.now()),
                )),
              )
              text(200, "Scrobble received")
            }
          }
        }
      }
    _ ->
      case string.starts_with(path, "/1/") {
        True ->
          promise.resolve(
            json(
              200,
              case
                string.ends_with(path, "listens")
                || string.ends_with(path, "recordings")
                || string.ends_with(path, "release-groups")
                || path == "/1/search/users"
              {
                True -> json.array([], json.string)
                False -> json.object([])
              },
            ),
          )
        False -> promise.resolve(text(404, "Not found"))
      }
  }
}

fn first(params: Dynamic, key: String) -> String {
  case value.string(params, key <> "[0]") {
    "" -> value.string(params, key)
    x -> x
  }
}

fn lastfm(
  config: Config,
  params: Dynamic,
  publish: fn(Dynamic) -> promise.Promise(Nil),
) -> promise.Promise(http.Response) {
  case value.string(params, "api_key") != config.api_key {
    True -> promise.resolve(error(10, "Invalid API key"))
    False ->
      case value.string(params, "api_sig") != signature(params, config.secret) {
        True -> promise.resolve(error(13, "Invalid method signature supplied"))
        False ->
          case value.string(params, "method") {
            "auth.getSession" ->
              promise.resolve(json(
                200,
                json.object([
                  #(
                    "session",
                    json.object([
                      #("name", json.string(config.handle)),
                      #("key", json.string(config.session)),
                      #("subscriber", json.int(0)),
                    ]),
                  ),
                ]),
              ))
            "track.updateNowPlaying" | "track.scrobble" ->
              case value.string(params, "sk") != config.session {
                True -> promise.resolve(error(9, "Invalid session key"))
                False -> {
                  let title = first(params, "track")
                  let artist = first(params, "artist")
                  let album = first(params, "album")
                  let timestamp = first(params, "timestamp")
                  case title == "" || artist == "" {
                    True -> promise.resolve(error(6, "Invalid parameters"))
                    False -> {
                      let fields = [
                        #(
                          "artist",
                          json.object([#("#text", json.string(artist))]),
                        ),
                        #(
                          "track",
                          json.object([#("#text", json.string(title))]),
                        ),
                        #(
                          "album",
                          json.object([#("#text", json.string(album))]),
                        ),
                        #(
                          "ignoredMessage",
                          json.object([
                            #("code", json.string("0")),
                            #("#text", json.string("")),
                          ]),
                        ),
                      ]
                      case value.string(params, "method") {
                        "track.updateNowPlaying" ->
                          promise.resolve(json(
                            200,
                            json.object([#("nowplaying", json.object(fields))]),
                          ))
                        _ -> {
                          let timestamp =
                            int.parse(timestamp) |> result.unwrap(node.now())
                          let _ =
                            publish(scrobble.input(
                              title,
                              artist,
                              album,
                              timestamp,
                            ))
                          promise.resolve(json(
                            200,
                            json.object([
                              #(
                                "scrobbles",
                                json.object([
                                  #(
                                    "@attr",
                                    json.object([
                                      #("accepted", json.int(1)),
                                      #("ignored", json.int(0)),
                                    ]),
                                  ),
                                  #(
                                    "scrobble",
                                    json.object([
                                      #(
                                        "timestamp",
                                        json.string(int.to_string(timestamp)),
                                      ),
                                      ..fields
                                    ]),
                                  ),
                                ]),
                              ),
                            ]),
                          ))
                        }
                      }
                    }
                  }
                }
              }
            _ -> promise.resolve(error(3, "Invalid method"))
          }
      }
  }
}
