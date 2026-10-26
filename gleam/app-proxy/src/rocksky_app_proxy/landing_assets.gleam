import gleam/javascript/promise
import gleam/list
import gleam/string
import rocksky_app_proxy/policy
import rocksky_app_proxy/routing
import rocksky_app_proxy/web

pub fn proxy(request: web.Request) -> promise.Promise(web.Response) {
  let head = web.method(request) == "HEAD"
  case routing.read_method(request) {
    False ->
      promise.resolve(web.response(
        "Method not allowed",
        405,
        [#("Allow", "GET, HEAD")],
        False,
      ))
    True -> {
      let headers =
        list.filter_map(
          ["Accept", "If-None-Match", "If-Modified-Since", "Range", "If-Range"],
          fn(name) {
            case web.header(request, name) {
              "" -> Error(Nil)
              value -> Ok(#(name, value))
            }
          },
        )
      let url = web.url(request)
      web.static_fetch(
        web.asset_url(url, string.drop_start(web.pathname(url), 9)),
        web.method(request),
        headers,
        False,
      )
      |> promise.map(fn(response) {
        let status = web.status(response)
        case
          { status >= 300 && status < 400 && status != 304 }
          || policy.html(response)
        {
          True ->
            web.response(
              "Asset not found",
              404,
              [#("Cache-Control", "no-store")],
              head,
            )
          False -> web.copy(response, [], ["Set-Cookie"], head)
        }
      })
      |> promise.rescue(fn(_) {
        web.response(
          "Landing assets unavailable",
          502,
          [#("Cache-Control", "no-store")],
          head,
        )
      })
    }
  }
}
