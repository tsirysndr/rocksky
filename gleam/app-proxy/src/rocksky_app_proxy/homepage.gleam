import gleam/javascript/promise
import rocksky_app_proxy/policy
import rocksky_app_proxy/routing
import rocksky_app_proxy/web

pub fn proxy(request: web.Request) -> promise.Promise(web.Response) {
  let head = web.method(request) == "HEAD"
  web.static_fetch(
    routing.homepage_origin(request),
    web.method(request),
    [],
    True,
  )
  |> promise.map(fn(response) {
    case policy.ok(response) && policy.html(response) {
      True ->
        web.copy(
          response,
          [
            #("Cache-Control", "private, no-store"),
            #("CDN-Cache-Control", "no-store"),
            #("Cloudflare-CDN-Cache-Control", "no-store"),
            #("Vary", "Cookie, User-Agent"),
          ],
          ["Set-Cookie", "ETag", "Last-Modified", "Expires"],
          head,
        )
      False -> unavailable(head)
    }
  })
  |> promise.rescue(fn(_) { unavailable(head) })
}

fn unavailable(head: Bool) -> web.Response {
  web.response(
    "Rocksky is temporarily unavailable. Please reload.",
    502,
    [#("Cache-Control", "no-store")],
    head,
  )
}
