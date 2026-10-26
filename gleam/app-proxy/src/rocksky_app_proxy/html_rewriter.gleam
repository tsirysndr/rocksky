import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option
import gleam/string
import rocksky_app_proxy/cloudflare
import rocksky_app_proxy/policy
import rocksky_app_proxy/web

pub type OgData {
  OgData(
    title: String,
    description: String,
    image: String,
    url: String,
    kind: String,
    card: String,
  )
}

fn decoder(url: String) -> decode.Decoder(OgData) {
  use title <- decode.field("title", decode.string)
  use description <- decode.field("description", decode.string)
  use image <- decode.field("image", decode.string)
  use url <- decode.optional_field("url", url, nullable_string(url))
  use kind <- decode.optional_field(
    "type",
    "website",
    nullable_string("website"),
  )
  use card <- decode.optional_field(
    "twitterCard",
    "summary_large_image",
    nullable_string("summary_large_image"),
  )
  decode.success(OgData(title, description, image, url, kind, card))
}

pub fn escape(value: String) -> String {
  value
  |> string.replace("&", "&amp;")
  |> string.replace("\"", "&quot;")
  |> string.replace("<", "&lt;")
  |> string.replace(">", "&gt;")
}

pub fn tags(og: OgData) -> String {
  let meta =
    [
      #("name", "description", og.description),
      #("property", "og:title", og.title),
      #("property", "og:description", og.description),
      #("property", "og:image", og.image),
      #("property", "og:url", og.url),
      #("property", "og:type", og.kind),
      #("name", "twitter:card", og.card),
      #("name", "twitter:title", og.title),
      #("name", "twitter:description", og.description),
      #("name", "twitter:image", og.image),
    ]
    |> list.map(fn(tag) {
      "<meta "
      <> tag.0
      <> "=\""
      <> tag.1
      <> "\" content=\""
      <> escape(tag.2)
      <> "\">"
    })
  string.join(["<title>" <> escape(og.title) <> "</title>", ..meta], "\n")
}

pub fn preview(
  request: web.Request,
  response: web.Response,
) -> promise.Promise(web.Response) {
  let url = web.url(request)
  use metadata <- promise.await(web.static_fetch(
    web.og_url(url),
    "GET",
    [],
    False,
  ))
  case policy.ok(metadata) {
    False -> promise.resolve(response)
    True -> {
      use body <- promise.map(web.text(metadata))
      case json.parse(body, decoder(web.url_string(url))) {
        Error(_) -> response
        Ok(og) ->
          rewrite(response, tags(og))
          |> web.copy([#("Cache-Control", "public, max-age=300")], [], False)
      }
    }
  }
}

pub type OgTarget {
  Profile(handle: String)
  Record(kind: String, did: String, rkey: String)
}

/// Mirrors the source helper; request previews themselves query /public/og for
/// every HTML app response, including percent-encoded deep links.
pub fn match_target(path: String) -> Result(OgTarget, Nil) {
  case string.split(path, "/") {
    ["", "profile", handle] if handle != "" ->
      Ok(Profile(web.decode_component(handle)))
    ["", did, kind, rkey] if rkey != "" -> {
      case
        string.starts_with(did, "did:plc:")
        && string.length(did) > 8
        && list.contains(["scrobble", "album", "artist", "song"], kind)
      {
        True ->
          Ok(Record(kind, web.decode_component(did), web.decode_component(rkey)))
        False -> Error(Nil)
      }
    }
    _ -> Error(Nil)
  }
}

fn rewrite(response: web.Response, tags: String) -> web.Response {
  cloudflare.new_rewriter()
  |> cloudflare.on_element("meta[property^=\"og:\"]", cloudflare.remove)
  |> cloudflare.on_element("meta[name^=\"twitter:\"]", cloudflare.remove)
  |> cloudflare.on_element("head", fn(head) {
    cloudflare.append_html(head, tags)
  })
  |> cloudflare.transform(response)
}

fn nullable_string(default: String) -> decode.Decoder(String) {
  decode.optional(decode.string)
  |> decode.map(fn(value) { option.unwrap(value, default) })
}
