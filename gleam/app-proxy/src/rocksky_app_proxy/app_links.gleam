import gleam/json
import gleam/list
import gleam/string
import rocksky_app_proxy/web

const local_certificate =
  "6D:87:91:43:C4:24:41:00:32:2E:F3:6E:91:9F:40:2C:DD:41:65:C6:9E:E2:49:03:0D:8C:0C:F7:13:36:76:54"

const play_certificate =
  "DD:B3:B5:D6:8E:F2:0B:09:86:58:BC:74:3A:B5:55:4B:81:BB:6A:68:D4:DB:F7:76:0D:A0:3A:23:7C:09:15:3B"

pub fn response(path: String, env: web.Environment) -> web.Response {
  let body = case path {
    "/.well-known/assetlinks.json" -> {
      let certificates =
        [
          local_certificate,
          play_certificate,
          ..web.env(env, "ANDROID_PLAY_SIGNING_SHA256")
          |> string.split(",")
          |> list.map(fn(value) { value |> string.trim |> string.uppercase })
        ]
        |> list.filter(fn(value) {
          web.matches(value, "^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$")
        })
        |> list.unique
      json.array(
        [
          json.object([
            #(
              "relation",
              json.array(
                [
                  "delegate_permission/common.handle_all_urls",
                  "delegate_permission/common.get_login_creds",
                ],
                json.string,
              ),
            ),
            #(
              "target",
              json.object([
                #("namespace", json.string("android_app")),
                #("package_name", json.string("app.rocksky")),
                #(
                  "sha256_cert_fingerprints",
                  json.array(certificates, json.string),
                ),
              ]),
            ),
          ]),
        ],
        fn(value) { value },
      )
    }
    _ -> {
      let team = web.env(env, "APPLE_TEAM_ID")
      let details = case
        string.length(team) == 10
        && team == string.uppercase(team)
        && web.matches(team, "^[A-Z0-9]{10}$")
      {
        True -> [
          json.object([
            #("appID", json.string(team <> ".app.rocksky")),
            #(
              "paths",
              json.array(
                [
                  "/profile/*",
                  "/*/song/*",
                  "/*/track/*",
                  "/*/album/*",
                  "/*/artist/*",
                  "/*/scrobble/*",
                ],
                json.string,
              ),
            ),
          ]),
        ]
        False -> []
      }
      json.object([
        #(
          "applinks",
          json.object([
            #("apps", json.array([], json.string)),
            #("details", json.array(details, fn(value) { value })),
          ]),
        ),
      ])
    }
  }
  web.response(
    json.to_string(body),
    200,
    [
      #("Content-Type", "application/json"),
      #("Cache-Control", "public, max-age=3600"),
    ],
    False,
  )
}
