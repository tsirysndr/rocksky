//// Bearer JWT verification against `JWT_SECRET`; access tokens must still
//// exist in `access_tokens` (a deleted row means revoked).

import gleam/dynamic/decode
import gleam/option.{type Option, None, Some}
import rocksky_api/db/db.{type Db}
import rocksky_api/drizzle/orm.{eq, field, one, select, where}
import rocksky_api/drizzle/schema/access_tokens as tokens
import rocksky_api/env.{type Env}
import rocksky_api/error
import rocksky_api/node/jwt
import rocksky_api/task.{type Task}

pub const access_token_type = "access_token"

pub type Payload {
  Payload(did: Option(String), jti: Option(String), token_type: Option(String))
}

pub fn verify(env: Env, db: Db, bearer: String) -> Task(Payload) {
  let payload = {
    use raw <- task.then(task.from_result(
      jwt.verify_ignoring_expiration(bearer, env.jwt_secret)
      |> error.map_js
      |> error_to_unauthorized,
    ))
    task.from_result(
      decode.run(raw, {
        use did <- decode.optional_field(
          "did",
          None,
          decode.optional(decode.string),
        )
        use jti <- decode.optional_field(
          "jti",
          None,
          decode.optional(decode.string),
        )
        use token_type <- decode.optional_field(
          "type",
          None,
          decode.optional(decode.string),
        )
        decode.success(Payload(did:, jti:, token_type:))
      })
      |> error.decode("jwt payload", _),
    )
  }
  use payload <- task.then(payload)
  case payload {
    Payload(jti: Some(jti), token_type: Some(t), ..) if t == access_token_type -> {
      let table = tokens.table()
      use row <- task.then(
        select(table, field("id", tokens.id(table)))
        |> where(eq(tokens.jti(table), jti))
        |> one(db),
      )
      case row {
        Some(_) -> task.ok(payload)
        None -> task.fail(error.Unauthorized("Access token revoked"))
      }
    }
    _ -> task.ok(payload)
  }
}

fn error_to_unauthorized(r: Result(a, error.Error)) -> Result(a, error.Error) {
  case r {
    Ok(v) -> Ok(v)
    Error(e) -> Error(error.Unauthorized(error.to_string(e)))
  }
}

/// The DID claim, or `Unauthorized`.
pub fn verify_did(env: Env, db: Db, bearer: String) -> Task(String) {
  use payload <- task.try_map(verify(env, db, bearer))
  case payload.did {
    Some(did) -> Ok(did)
    None -> Error(error.Unauthorized("Token has no did"))
  }
}
