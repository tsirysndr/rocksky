import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, delete, eq, field, from, insert, map, one, pair, returning_one, run,
  select, set, where,
}
import rocksky_api/drizzle/schema/user_storage_providers as p
import rocksky_api/drizzle/schema/user_uploads as up
import rocksky_api/error
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/node/crypto
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/node/s3
import rocksky_api/schema/user_storage_providers
import rocksky_api/task

pub type Storage {
  Storage(
    client: s3.Client,
    bucket: String,
    storage_provider_id: Option(String),
  )
}

pub fn resolve_storage_client(
  ctx: Context,
  user_id: String,
  provider_id: Option(String),
) {
  case provider_id {
    None | Some("") ->
      task.ok(Storage(
        s3.client(
          ctx.env.s3_region,
          ctx.env.s3_endpoint,
          ctx.env.s3_access_key_id,
          ctx.env.s3_secret_access_key,
        ),
        ctx.env.s3_bucket_name,
        None,
      ))
    Some(id) -> {
      let table = p.table()
      use provider <- task.then(
        from(table)
        |> where(and([eq(p.id(table), id), eq(p.user_id(table), user_id)]))
        |> one(ctx.db)
        |> task.require_task("Storage provider " <> id <> " not found for user"),
      )
      use keys <- task.map(task.all2(
        crypto.secretbox_decrypt(
          provider.access_key,
          ctx.env.storage_encryption_key,
        )
          |> task.attempt_result,
        crypto.secretbox_decrypt(
          provider.secret_key,
          ctx.env.storage_encryption_key,
        )
          |> task.attempt_result,
      ))
      Storage(
        s3.client(provider.region, provider.endpoint, keys.0, keys.1),
        provider.bucket,
        Some(provider.id),
      )
    }
  }
}

fn metadata_selection(table) {
  pair(
    pair(field("id", p.id(table)), field("label", p.label(table))),
    pair(
      pair(
        field("endpoint", p.endpoint(table)),
        field("region", p.region(table)),
      ),
      pair(
        pair(
          field("bucket", p.bucket(table)),
          field("public_url", p.public_url(table)),
        ),
        pair(
          field("verified_at", p.verified_at(table)),
          field("created_at", p.created_at(table)),
        ),
      ),
    ),
  )
  |> map(fn(v) {
    json.object([
      #("id", json.string(v.0.0)),
      #("label", json.string(v.0.1)),
      #("endpoint", json.string(v.1.0.0)),
      #("region", json.string(v.1.0.1)),
      #("bucket", json.string(v.1.1.0.0)),
      #("public_url", json.nullable(v.1.1.0.1, json.string)),
      #(
        "verified_at",
        json.nullable(v.1.1.1.0, fn(t) { json.string(row.iso8601(t)) }),
      ),
      #("created_at", json.string(row.iso8601(v.1.1.1.1))),
    ])
  })
}

fn encode(p: user_storage_providers.UserStorageProvider) {
  json.object([
    #("id", json.string(p.id)),
    #("label", json.string(p.label)),
    #("endpoint", json.string(p.endpoint)),
    #("region", json.string(p.region)),
    #("bucket", json.string(p.bucket)),
    #("public_url", json.nullable(p.public_url, json.string)),
    #(
      "verified_at",
      json.nullable(p.verified_at, fn(t) { json.string(row.iso8601(t)) }),
    ),
    #("created_at", json.string(row.iso8601(p.created_at))),
  ])
}

pub fn connectivity_message(e: js.Exception, bucket: String) {
  let raw = js.to_dynamic(e)
  let status =
    decode.run(raw, decode.at(["$metadata", "httpStatusCode"], decode.int))
    |> result.unwrap(0)
  let name = decode.run(js.get(raw, "name"), decode.string) |> result.unwrap("")
  case status, name, js.code(e) {
    403, _, _ | _, "Forbidden", _ ->
      "The bucket refused these credentials (403). Check the access key, secret key, and that they have permission on this bucket."
    404, _, _ | _, "NotFound", _ ->
      "Bucket \""
      <> bucket
      <> "\" was not found at that endpoint (404). Check the bucket name and endpoint URL."
    301, _, _ ->
      "The bucket exists but in a different region (301). Set the region this bucket actually lives in."
    _, _, Some("ENOTFOUND") | _, _, Some("ECONNREFUSED") ->
      "Could not reach that endpoint. Check the endpoint URL."
    _, _, _ ->
      case decode.run(js.get(raw, "message"), decode.string) {
        Ok(m) if m != "" && m != "UnknownError" -> m
        _ -> "Failed to connect to the S3 bucket with these credentials."
      }
  }
}

pub type Input {
  Input(
    label: String,
    endpoint: String,
    region: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    public_url: Option(String),
  )
}

fn decoder() {
  use label <- decode.field("label", decode.string)
  use endpoint <- decode.field("endpoint", decode.string)
  use region <- decode.optional_field("region", "auto", decode.string)
  use bucket <- decode.field("bucket", decode.string)
  use access_key <- decode.field("access_key", decode.string)
  use secret_key <- decode.field("secret_key", decode.string)
  use public_url <- decode.optional_field(
    "public_url",
    None,
    decode.optional(decode.string),
  )
  decode.success(Input(
    label,
    endpoint,
    region,
    bucket,
    access_key,
    secret_key,
    public_url,
  ))
}

fn create(ctx: Context, c: hono.Context, user_id: String) {
  use raw <- task.then(
    hono.json_body(c)
    |> task.attempt_result
    |> task.map_error(fn(_) { error.InvalidRequest("Invalid JSON") }),
  )
  use input <- task.then(
    decode.run(raw, decoder())
    |> result.map_error(fn(_) {
      error.InvalidRequest(
        "Missing required fields: label, endpoint, bucket, access_key, secret_key",
      )
    })
    |> task.from_result,
  )
  case
    input.label == ""
    || input.endpoint == ""
    || input.bucket == ""
    || input.access_key == ""
    || input.secret_key == ""
  {
    True ->
      task.fail(error.InvalidRequest(
        "Missing required fields: label, endpoint, bucket, access_key, secret_key",
      ))
    False -> {
      let client =
        s3.client(
          input.region,
          input.endpoint,
          input.access_key,
          input.secret_key,
        )
      use connected <- promise.await(s3.head_bucket(client, input.bucket))
      case connected {
        Error(e) ->
          task.ok(hono.json(
            c,
            json.object([
              #("error", json.string("CONNECTIVITY_FAILED")),
              #("message", json.string(connectivity_message(e, input.bucket))),
            ]),
            422,
          ))
        Ok(_) -> {
          use keys <- task.then(task.all2(
            crypto.secretbox_encrypt(
              input.access_key,
              ctx.env.storage_encryption_key,
            )
              |> task.attempt_result,
            crypto.secretbox_encrypt(
              input.secret_key,
              ctx.env.storage_encryption_key,
            )
              |> task.attempt_result,
          ))
          let table = p.table()
          use provider <- task.map(
            insert(table, [
              set(p.user_id(table), user_id),
              set(p.label(table), input.label),
              set(p.endpoint(table), input.endpoint),
              set(p.region(table), input.region),
              set(p.bucket(table), input.bucket),
              set(p.access_key(table), keys.0),
              set(p.secret_key(table), keys.1),
              set(p.public_url(table), input.public_url),
              set(p.verified_at(table), Some(row.from_unix_ms(js.now_ms()))),
            ])
            |> returning_one(ctx.db, "Storage provider insert failed"),
          )
          hono.json(c, encode(provider), 201)
        }
      }
    }
  }
}

pub fn app(ctx: Context) {
  hono.new()
  |> hono.post("/providers", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      create(ctx, c, user.id)
    }
    respond.with(c, work, fn(response) { response })
  })
  |> hono.get("/providers", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let table = p.table()
      select(table, metadata_selection(table))
      |> where(eq(p.user_id(table), user.id))
      |> all(ctx.db)
      |> task.map(json.array(_, fn(x) { x }))
    }
    respond.json(c, work)
  })
  |> hono.delete("/providers/:id", fn(c) {
    let work = {
      use user <- task.then(auth.user(ctx, c))
      let table = p.table()
      let uploads = up.table()
      let id = hono.param(c, "id")
      use _ <- task.then(
        from(table)
        |> where(and([eq(p.id(table), id), eq(p.user_id(table), user.id)]))
        |> one(ctx.db)
        |> task.require_task("Not found"),
      )
      use upload <- task.then(
        select(uploads, field("id", up.id(uploads)))
        |> where(eq(up.storage_provider_id(uploads), Some(id)))
        |> one(ctx.db),
      )
      case upload {
        Some(_) ->
          task.ok(hono.json(
            c,
            json.object([
              #("error", json.string("PROVIDER_IN_USE")),
              #(
                "message",
                json.string(
                  "Cannot delete a storage provider that has uploads referencing it",
                ),
              ),
            ]),
            409,
          ))
        None -> {
          use _ <- task.map(delete(table, eq(p.id(table), id)) |> run(ctx.db))
          hono.empty(c, 204)
        }
      }
    }
    respond.with(c, work, fn(response) { response })
  })
}
