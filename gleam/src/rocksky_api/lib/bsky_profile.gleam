//// Avatar and display name from the public Bluesky AppView, falling back to
//// the profile record on the user's PDS.

import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/atproto/agent.{type Agent}
import rocksky_api/lib/helpers
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/task.{type Task}

pub type Profile {
  Profile(avatar: Option(String), display_name: Option(String))
}

pub fn empty() -> Profile {
  Profile(None, None)
}

pub fn fetch(
  appview_url: String,
  did: String,
  agent: Option(Agent),
) -> Task(Profile) {
  let appview = agent.atp_agent(appview_url)
  use primary <- promise.await(agent.get_profile(appview, did))
  case primary {
    Ok(data) ->
      task.ok(Profile(
        avatar: helpers.non_empty(field(data, "avatar")),
        display_name: helpers.non_empty(field(data, "displayName")),
      ))
    Error(e) -> {
      log.warn_exception(
        "AppView getProfile failed for " <> did <> "; falling back to PDS:",
        e,
      )
      case agent {
        None -> task.ok(empty())
        Some(agent) -> {
          use record <- promise.await(agent.get_record(
            agent,
            did,
            "app.bsky.actor.profile",
            "self",
          ))
          case record {
            Ok(record) -> {
              let cid =
                decode.run(
                  record.value,
                  decode.at(["avatar", "ref"], decode.dynamic),
                )
                |> option.from_result
                |> option.map(js.to_string)
                |> option.then(fn(value) {
                  case value {
                    "" -> None
                    _ -> Some(value)
                  }
                })
              let ext = case field(record.value, "avatar.mimeType") {
                Some(mime) ->
                  case string.split(mime, "/") {
                    [_, e, ..] if e != "" -> e
                    _ -> "jpeg"
                  }
                None -> "jpeg"
              }
              task.ok(Profile(
                avatar: option.map(cid, fn(c) {
                  "https://cdn.bsky.app/img/avatar/plain/"
                  <> did
                  <> "/"
                  <> c
                  <> "@"
                  <> ext
                }),
                display_name: helpers.non_empty(field(
                  record.value,
                  "displayName",
                )),
              ))
            }
            Error(e) -> {
              log.error_exception(
                "Failed to read profile record from PDS for " <> did <> ":",
                e,
              )
              task.ok(empty())
            }
          }
        }
      }
    }
  }
}

fn field(data, path: String) -> Option(String) {
  decode.run(data, decode.at(string.split(path, "."), decode.string))
  |> option.from_result
}
