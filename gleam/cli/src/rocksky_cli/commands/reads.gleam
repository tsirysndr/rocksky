import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/client
import rocksky_cli/node
import rocksky_cli/sdk
import rocksky_cli/value

pub fn run(
  command: String,
  args: List(String),
  options: Dynamic,
) -> promise.Promise(Nil) {
  let did = list.first(args) |> result.unwrap("")
  let params = [
    #("offset", int.to_string(value.integer(options, "skip", 0))),
    #("size", int.to_string(value.integer(options, "limit", 20))),
  ]
  case command {
    "whoami" -> {
      use response <- promise.map(
        case node.env("ROCKSKY_IDENTIFIER"), node.env("ROCKSKY_PASSWORD") {
          identifier, password if identifier != "" && password != "" -> {
            use authenticated <- promise.await(sdk.login(identifier, password))
            case authenticated {
              Error(e) -> promise.resolve(Error(e))
              Ok(agent) ->
                client.xrpc("actor.getProfile", [#("did", sdk.did(agent))])
            }
          }
          _, _ -> client.get("/profile", [])
        },
      )
      show(response, fn(user) {
        node.print(
          "You are logged in as "
          <> value.string(user, "handle")
          <> " ("
          <> value.string(user, "displayName")
          <> ").\nView your profile at: https://rocksky.app/profile/"
          <> value.string(user, "handle"),
        )
      })
    }
    "scrobbles" -> {
      let path = case did {
        "" -> "/public/scrobbles"
        _ -> "/users/" <> node.encode(did) <> "/scrobbles"
      }
      use response <- promise.map(client.get(path, params))
      show(response, fn(rows) {
        list.each(value.items(rows), fn(row) {
          let date = case did {
            "" -> value.string(row, "date")
            _ -> value.string(row, "created_at") <> "Z"
          }
          let prefix = case did {
            "" -> "@" <> value.string(row, "user") <> " is listening to "
            _ -> ""
          }
          node.print(
            prefix
            <> value.string(row, "title")
            <> " "
            <> value.string(row, "artist")
            <> " "
            <> node.relative_time(date),
          )
        })
      })
    }
    "search" -> {
      use response <- promise.map(
        client.xrpc("feed.search", [
          #("query", did),
          #("size", int.to_string(value.integer(options, "limit", 20))),
        ]),
      )
      show(response, fn(data) {
        let hits = value.items(value.field(data, "hits"))
        case hits {
          [] -> node.print("No results found for " <> did <> ".")
          _ ->
            list.each(hits, fn(record) {
              let kind =
                value.at(record, ["_federation", "indexUid"]) |> value.text
              let selected =
                ["albums", "artists", "tracks", "users"]
                |> list.filter(fn(k) { value.boolean(options, k) })
              case list.all(selected, fn(k) { k == kind }) {
                False -> Nil
                True ->
                  case kind {
                    "users" ->
                      node.print(
                        value.string(record, "handle")
                        <> " "
                        <> value.string(record, "displayName")
                        <> " https://rocksky.app/profile/"
                        <> value.string(record, "did"),
                      )
                    "albums" | "tracks" ->
                      node.print(
                        value.string(record, "title")
                        <> " "
                        <> value.string(record, "artist")
                        <> " "
                        <> record_url(value.string(record, "uri")),
                      )
                    "artists" ->
                      node.print(
                        value.string(record, "name")
                        <> " "
                        <> record_url(value.string(record, "uri")),
                      )
                    _ -> Nil
                  }
              }
            })
        }
      })
    }
    "nowplaying" -> nowplaying(did)
    "create apikey" -> {
      use response <- promise.map(client.post(
        "/apikeys",
        json.object([
          #("name", json.string(did)),
          #("description", json.string(value.string(options, "description"))),
        ]),
      ))
      show(response, fn(key) {
        node.print(
          "API key created successfully!\nName: "
          <> value.string(key, "name")
          <> "\nDescription: "
          <> value.string(key, "description")
          <> "\nKey: "
          <> value.string(key, "api_key")
          <> "\nSecret: "
          <> value.string(key, "shared_secret"),
        )
      })
    }
    _ -> {
      use actor <- promise.await(client.actor(did))
      case actor {
        Error(message) -> {
          fail(message)
          promise.resolve(Nil)
        }
        Ok(did) -> {
          use response <- promise.map(client.get(
            "/users/" <> node.encode(did) <> "/" <> command,
            params,
          ))
          show(response, fn(data) {
            case command {
              "stats" ->
                list.each(
                  [
                    #("Scrobbles", "scrobbles"),
                    #("Tracks", "tracks"),
                    #("Albums", "albums"),
                    #("Artists", "artists"),
                    #("Loved Tracks", "lovedTracks"),
                  ],
                  fn(pair) {
                    node.print(
                      pair.0 <> "  " <> value.text(value.field(data, pair.1)),
                    )
                  },
                )
              _ ->
                data
                |> value.items
                |> list.index_map(fn(row, index) {
                  int.to_string(index + 1)
                  <> " "
                  <> value.string(row, case command {
                    "artists" -> "name"
                    _ -> "title"
                  })
                  <> " "
                  <> value.string(row, "artist")
                  <> " "
                  <> value.text(value.field(row, "play_count"))
                  <> " plays"
                })
                |> list.each(node.print)
            }
          })
        }
      }
    }
  }
}

pub fn fail(message: String) -> Nil {
  node.error(message)
  node.exit_code(1)
}

pub fn show(
  response: Result(Dynamic, String),
  display: fn(Dynamic) -> Nil,
) -> Nil {
  case response {
    Ok(data) -> display(data)
    Error(message) -> fail(message)
  }
}

fn nowplaying(did: String) -> promise.Promise(Nil) {
  use response <- promise.await(
    client.get("/spotify/currently-playing", [#("did", did)]),
  )
  case response {
    Error(message) -> {
      fail(message)
      promise.resolve(Nil)
    }
    Ok(data) ->
      case value.is_null(value.field(data, "item")) {
        False -> {
          let item = value.field(data, "item")
          node.print(
            value.string(item, "name")
            <> " - "
            <> {
              value.field(item, "artists")
              |> value.items
              |> list.map(fn(a) { value.string(a, "name") })
              |> string.join(", ")
            }
            <> "\n"
            <> value.text(value.at(item, ["album", "name"])),
          )
          promise.resolve(Nil)
        }
        True -> {
          use response <- promise.map(
            client.get("/now-playing", [#("did", did)]),
          )
          show(response, fn(data) {
            case value.string(data, "title") {
              "" -> node.print("No track is currently playing.")
              title ->
                node.print(
                  title
                  <> " - "
                  <> value.string(data, "artist")
                  <> "\n"
                  <> value.string(data, "album"),
                )
            }
          })
        }
      }
  }
}

pub fn record_url(uri: String) -> String {
  case uri {
    "" -> ""
    _ ->
      "https://rocksky.app/"
      <> {
        uri |> string.replace("at://", "") |> string.replace("app.rocksky.", "")
      }
  }
}
