//// Calls to the internal HTTP services whose JSON is passed straight through.

import gleam/dynamic.{type Dynamic}
import gleam/json.{type Json}
import rocksky_api/context.{type Context}
import rocksky_api/node/axios
import rocksky_api/node/js
import rocksky_api/task.{type Task}

/// `POST <ANALYTICS>/<method>`; the response body as JSON.
pub fn analytics(ctx: Context, method: String, body: Json) -> Task(Json) {
  use response <- task.map(
    task.attempt_result(axios.post(
      ctx.analytics,
      method,
      body,
      axios.default_options(),
    )),
  )
  js.coerce(response.data)
}

pub fn analytics_dynamic(
  ctx: Context,
  method: String,
  body: Json,
) -> Task(Dynamic) {
  use response <- task.map(
    task.attempt_result(axios.post(
      ctx.analytics,
      method,
      body,
      axios.default_options(),
    )),
  )
  response.data
}

/// A JS value that is already JSON-shaped, as `Json`.
pub fn passthrough(data: Dynamic) -> Json {
  js.coerce(data)
}
