import gleam/dict
import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/javascript/promise
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/cell
import rocksky_cli/commands/reads
import rocksky_cli/imports/checkpoint
import rocksky_cli/imports/parsers
import rocksky_cli/node
import rocksky_cli/sdk
import rocksky_cli/value

pub fn fallback(error: Dynamic) -> Bool {
  value.string(error, "name") == "RockskyError"
  && value.string(error, "kind") == "NotFound"
  && list.contains([400, 404], value.integer(error, "status", 0))
  && list.contains(
    ["No unambiguous song match", "Song not found"],
    value.string(error, "message"),
  )
}

pub fn error_text(error: Dynamic) -> String {
  let message = case value.string(error, "message") {
    "" ->
      case value.text(error) {
        "" -> "Unknown import error"
        x -> x
      }
    x -> x
  }
  let parts =
    [
      value.string(error, "kind"),
      case value.integer(error, "status", 0) {
        0 -> ""
        n -> "HTTP " <> int.to_string(n)
      },
    ]
    |> list.filter(fn(x) { x != "" })
  message
  <> case parts {
    [] -> ""
    _ -> " [" <> string.join(parts, ", ") <> "]"
  }
}

pub fn filter(
  tracks: List(Dynamic),
  options: Dynamic,
) -> Result(List(Dynamic), String) {
  use from <- result.try(case value.string(options, "from") {
    "" -> Ok(0)
    date -> node.timestamp(date)
  })
  use to <- result.try(case value.string(options, "to") {
    "" -> Ok(9_007_199_254_740_991)
    date -> node.timestamp(date)
  })
  let tracks =
    list.filter(tracks, fn(track) {
      let timestamp = value.integer(track, "timestamp", 0)
      timestamp >= from && timestamp <= to
    })
  Ok(case value.string(options, "limit") {
    "" -> tracks
    _ ->
      list.take(
        tracks,
        int.max(0, value.integer(options, "limit", list.length(tracks))),
      )
  })
}

pub fn run(file: String, options: Dynamic) -> promise.Promise(Nil) {
  let parsed =
    parsers.parse(
      file,
      string.lowercase(value.string(options, "format")),
      value.integer(options, "minSeconds", 30),
    )
  case parsed {
    Error(e) -> {
      reads.fail(e)
      promise.resolve(Nil)
    }
    Ok(parsed) -> {
      list.each(dict.to_list(parsed.skipped), fn(pair) {
        node.print("Skipped " <> int.to_string(pair.1) <> " " <> pair.0)
      })
      case filter(parsed.scrobbles, options) {
        Error(e) -> {
          reads.fail(e)
          promise.resolve(Nil)
        }
        Ok(tracks) -> {
          node.print(
            "Detected "
            <> parsed.format
            <> ": "
            <> int.to_string(list.length(tracks))
            <> " scrobbles",
          )
          case value.boolean(options, "dryRun") {
            True -> {
              node.print("Dry run — nothing will be written")
              list.each(tracks, fn(track) {
                node.print(
                  node.iso_date(value.integer(track, "timestamp", 0))
                  <> " "
                  <> value.string(track, "title")
                  <> " — "
                  <> value.string(track, "artist"),
                )
              })
              promise.resolve(Nil)
            }
            False ->
              case tracks {
                [] -> {
                  node.print("Nothing to import.")
                  promise.resolve(Nil)
                }
                _ -> publish(file, parsed.format, tracks, options)
              }
          }
        }
      }
    }
  }
}

pub fn authenticate() -> promise.Promise(Result(sdk.Agent, String)) {
  let identifier = case node.env("ROCKSKY_IDENTIFIER") {
    "" -> node.env("ROCKSKY_HANDLE")
    x -> x
  }
  let password = node.env("ROCKSKY_PASSWORD")
  case identifier == "" || password == "" {
    True ->
      promise.resolve(Error(
        "Set ROCKSKY_IDENTIFIER (or ROCKSKY_HANDLE) and ROCKSKY_PASSWORD to an app password.",
      ))
    False -> sdk.login(identifier, password)
  }
}

pub fn publish(
  file: String,
  format: String,
  tracks: List(Dynamic),
  options: Dynamic,
) -> promise.Promise(Nil) {
  use authenticated <- promise.await(authenticate())
  case authenticated {
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
          reads.fail("Could not build required dedup index: " <> e)
          promise.resolve(Nil)
        }
        Ok(index) -> {
          use synced <- promise.await(sdk.sync(agent))
          case synced {
            Error(e) -> {
              reads.fail("Could not build required dedup index: " <> e)
              sdk.close(index)
            }
            Ok(_) -> import_tracks(file, format, tracks, options, agent, index)
          }
        }
      }
    }
  }
}

fn import_tracks(
  file: String,
  format: String,
  tracks: List(Dynamic),
  options: Dynamic,
  agent: sdk.Agent,
  index: sdk.Index,
) -> promise.Promise(Nil) {
  let subscription = sdk.hydrate(agent)
  let saved = case value.boolean(options, "restart") {
    True -> value.null()
    False -> checkpoint.load(file)
  }
  let #(tracker, pending) = checkpoint.restore(tracks, saved)
  let tracker = cell.new(tracker)
  let stopped = cell.new(False)
  let failures = cell.new(0)
  let flush = fn() {
    case checkpoint.save(file, format, tracks, cell.get(tracker)) {
      Ok(_) -> Nil
      Error(e) -> reads.fail("Could not save checkpoint: " <> e)
    }
  }
  let unregister =
    sdk.signal(fn() {
      cell.set(stopped, True)
      flush()
      node.exit_code(130)
      node.print(
        "Stopping after in-flight writes; checkpoint saved. Re-run to resume.",
      )
    })
  let _ =
    sdk.rate_limit(
      agent,
      value.integer(options, "rate", 0),
      !value.is_null(value.field(options, "rateLimit"))
        && !value.boolean(options, "rateLimit"),
    )
  node.print(
    "Publishing " <> int.to_string(list.length(pending)) <> " pending scrobbles",
  )
  use _ <- promise.await(
    sdk.parallel(
      pending,
      int.max(1, value.integer(options, "concurrency", 4)),
      fn(i) {
        case cell.get(stopped) {
          True -> promise.resolve(Nil)
          False -> {
            let track =
              tracks
              |> list.drop(i)
              |> list.first
              |> result.unwrap(value.null())
            use outcome <- promise.map(retry(agent, index, track, 0))
            case outcome {
              Ok(_) -> {
                cell.set(tracker, checkpoint.complete(cell.get(tracker), i))
                flush()
                node.print("Imported " <> value.string(track, "title"))
              }
              Error(e) -> {
                cell.set(failures, cell.get(failures) + 1)
                reads.fail(
                  value.string(track, "title") <> ": " <> error_text(e),
                )
              }
            }
          }
        }
      },
    ),
  )
  unregister()
  flush()
  use _ <- promise.await(sdk.stop(subscription))
  use _ <- promise.map(sdk.close(index))
  node.print(
    "Import finished; "
    <> int.to_string(cell.get(failures))
    <> " failed. Checkpoint retained for resume.",
  )
}

fn retry(
  agent: sdk.Agent,
  index: sdk.Index,
  track: Dynamic,
  attempt: Int,
) -> promise.Promise(Result(String, Dynamic)) {
  use outcome <- promise.await(sdk.publish(agent, index, track, fallback))
  case outcome {
    Error(error) ->
      case
        attempt < 5
        && {
          value.integer(error, "status", 0) == 429
          || value.integer(error, "status", 0) >= 500
        }
      {
        True -> {
          use _ <- promise.await(node.delay(1000 * backoff(attempt)))
          retry(agent, index, track, attempt + 1)
        }
        False -> promise.resolve(outcome)
      }
    _ -> promise.resolve(outcome)
  }
}

fn backoff(attempt: Int) -> Int {
  case attempt {
    0 -> 1
    _ -> 2 * backoff(attempt - 1)
  }
}
