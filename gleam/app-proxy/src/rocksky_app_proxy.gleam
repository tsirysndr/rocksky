import gleam/javascript/promise
import gleam/list
import gleam/string
import rocksky_app_proxy/app_links
import rocksky_app_proxy/homepage
import rocksky_app_proxy/html_rewriter
import rocksky_app_proxy/landing_assets
import rocksky_app_proxy/metadata
import rocksky_app_proxy/policy
import rocksky_app_proxy/routing
import rocksky_app_proxy/web

pub fn fetch(
  request: web.Request,
  env: web.Environment,
) -> promise.Promise(web.Response) {
  let url = web.url(request)
  let path = web.pathname(url)
  case path {
    "/.well-known/assetlinks.json"
    | "/.well-known/apple-app-site-association" ->
      promise.resolve(app_links.response(path, env))
    _ ->
      case web.method(request) == "OPTIONS" {
        True ->
          promise.resolve(web.response("", 204, policy.cors(request), True))
        False -> route(request, path)
      }
  }
}

fn route(request: web.Request, path: String) -> promise.Promise(web.Response) {
  case string.starts_with(path, "/_landing/") {
    True -> landing_assets.proxy(request)
    False ->
      case path {
        "/privacy-policy" ->
          promise.resolve(web.redirect(web.url(request), "/privacy"))
        "/oauth-client-metadata.json" ->
          promise.resolve(policy.json(metadata.metadata))
        "/jwks.json" -> promise.resolve(policy.json(metadata.jwks))
        _ ->
          case string.starts_with(path, "/rockbox/") {
            True -> {
              use response <- promise.map(web.forward(
                request,
                "rocksky.pages.dev",
                False,
              ))
              web.copy(
                response,
                [#("Access-Control-Allow-Origin", "*")],
                [],
                False,
              )
            }
            False ->
              case routing.api(path) {
                True -> {
                  use response <- promise.map(web.forward(
                    request,
                    "api.rocksky.app",
                    True,
                  ))
                  web.copy(
                    response,
                    list.append(policy.cors(request), [
                      #(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate, max-age=0",
                      ),
                    ]),
                    ["Expires", "ETag"],
                    False,
                  )
                }
                False ->
                  case routing.homepage(request) {
                    True -> homepage.proxy(request)
                    False -> {
                      use response <- promise.await(web.forward(
                        request,
                        routing.app_host(request),
                        False,
                      ))
                      case policy.ok(response) && policy.html(response) {
                        False ->
                          promise.resolve(web.copy(
                            response,
                            policy.cors(request),
                            [],
                            False,
                          ))
                        True -> html_rewriter.preview(request, response)
                      }
                    }
                  }
              }
          }
      }
  }
}
