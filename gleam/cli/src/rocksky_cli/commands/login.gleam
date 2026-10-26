import gleam/javascript/promise
import gleam/json
import gleam/string
import rocksky_cli/client
import rocksky_cli/commands/reads
import rocksky_cli/host
import rocksky_cli/node
import rocksky_cli/value

pub fn run(handle: String) -> promise.Promise(Nil) {
  use opened <- promise.await(
    host.oauth_listener(6996, fn(data) {
      case node.write(node.state_path("token.json"), value.stringify(data)) {
        Ok(_) -> {
          node.remove(node.state_path("did"))
          node.remove(node.state_path("navidrome.json"))
          node.print("Login successful!")
          Ok(Nil)
        }
        Error(message) -> {
          reads.fail("Could not save token: " <> message)
          Error(message)
        }
      }
    }),
  )
  case opened {
    Error(message) -> {
      reads.fail(message)
      promise.resolve(Nil)
    }
    Ok(server) -> {
      use response <- promise.await(client.post(
        "/login",
        json.object([
          #("handle", json.string(handle)),
          #("cli", json.bool(True)),
        ]),
      ))
      case response {
        Error(message) -> {
          host.close_server(server)
          reads.fail(message)
          promise.resolve(Nil)
        }
        Ok(data) -> {
          let url = value.text(data)
          case string.contains(url, "authorize") {
            False -> {
              host.close_server(server)
              reads.fail(
                "Failed to login, please check your handle and try again.",
              )
              promise.resolve(Nil)
            }
            True -> {
              node.print("Please visit this URL to authorize the app:\n" <> url)
              node.open_browser(url)
              |> promise.rescue(fn(_) {
                node.print(
                  "Open the URL above in your browser to finish signing in.",
                )
              })
            }
          }
        }
      }
    }
  }
}
