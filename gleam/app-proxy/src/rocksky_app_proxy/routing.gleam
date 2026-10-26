import gleam/list
import gleam/string
import rocksky_app_proxy/web

pub fn mobile(request: web.Request) -> Bool {
  web.matches(
    web.header(request, "User-Agent"),
    "Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini",
  )
}

pub fn app_host(request: web.Request) -> String {
  case mobile(request) {
    True -> "m.rocksky.app"
    False -> "rocksky.pages.dev"
  }
}

pub fn read_method(request: web.Request) -> Bool {
  list.contains(["GET", "HEAD"], web.method(request))
}

pub fn homepage(request: web.Request) -> Bool {
  read_method(request)
  && list.contains(
    ["/", "/index.html", "/atpassport/callback"],
    web.pathname(web.url(request)),
  )
}

pub fn homepage_origin(request: web.Request) -> String {
  let url = web.url(request)
  let path = web.pathname(url)
  let session =
    web.header(request, "Cookie")
    |> string.split(";")
    |> list.any(fn(part) { string.trim(part) == "rocksky_session_hint=1" })
  let handoff =
    web.query_has(url, "did")
    || web.query_has(url, "cli")
    || web.query(url, "session") == "expired"
    || web.query(url, "__rocksky_app") == "1"
  case
    path == "/index.html"
    || { path != "/atpassport/callback" && { session || handoff } }
  {
    True -> "https://" <> app_host(request) <> "/"
    False -> "https://rocksky-landing.pages.dev/"
  }
}

pub fn api(path: String) -> Bool {
  list.contains(
    [
      "/login",
      "/profile",
      "/token",
      "/now-playing",
      "/ws",
      "/oauth-client-metadata.json",
      "/jwks.json",
    ],
    path,
  )
  || list.any(
    [
      "/oauth/callback",
      "/users",
      "/albums",
      "/artists",
      "/tracks",
      "/scrobbles",
      "/likes",
      "/spotify",
      "/dropbox/oauth/callback",
      "/googledrive/oauth/callback",
      "/dropbox/files",
      "/dropbox/file",
      "/googledrive/files",
      "/dropbox/login",
      "/googledrive/login",
      "/dropbox/join",
      "/googledrive/join",
      "/search",
      "/public/scrobbles",
      "/notifications",
      "/uploads",
    ],
    fn(prefix) { string.starts_with(path, prefix) },
  )
}
