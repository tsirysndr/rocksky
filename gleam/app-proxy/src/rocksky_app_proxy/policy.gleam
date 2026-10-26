import gleam/list
import gleam/string
import rocksky_app_proxy/web

pub fn cors(request: web.Request) -> web.Headers {
  let origin = web.header(request, "Origin")
  let allowed = case
    list.contains(["https://m.rocksky.app", "https://rocksky.app"], origin)
  {
    True -> origin
    False -> "https://m.rocksky.app"
  }
  [
    #("Access-Control-Allow-Origin", allowed),
    #("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS"),
    #("Access-Control-Allow-Headers", "Content-Type, Authorization, Range"),
    #(
      "Access-Control-Expose-Headers",
      "Content-Range, Content-Length, Accept-Ranges",
    ),
    #("Access-Control-Max-Age", "86400"),
  ]
}

pub fn html(response: web.Response) -> Bool {
  web.response_header(response, "Content-Type")
  |> string.lowercase
  |> string.contains("text/html")
}

pub fn ok(response: web.Response) -> Bool {
  web.status(response) >= 200 && web.status(response) < 300
}

pub fn json(body: String) -> web.Response {
  web.response(body, 200, [#("Content-Type", "application/json")], False)
}
