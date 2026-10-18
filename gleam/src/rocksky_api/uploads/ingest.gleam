import gleam/bit_array
import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleam/uri
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  and, eq, from, insert, one, returning_one, set, where,
}
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_uploads as up
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/lib/track
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/files
import rocksky_api/node/hono
import rocksky_api/node/music_metadata
import rocksky_api/node/s3
import rocksky_api/schema/users.{type User}
import rocksky_api/storage/app as storage
import rocksky_api/task
import rocksky_api/tracks/service
import rocksky_api/typesense/library
import rocksky_api/uploads/analysis
import rocksky_api/uploads/metadata.{type Metadata}
import rocksky_api/uploads/replaygain
import rocksky_api/uploads/stream

fn failure(c: hono.Context, code: Int, name: String, message: String) {
  hono.json(
    c,
    json.object([
      #("error", json.string(name)),
      #("message", json.string(message)),
    ]),
    code,
  )
}

fn cover(ctx: Context, meta: Metadata) {
  let work = {
    case meta.pictures {
      [] -> task.ok(None)
      [picture, ..] ->
        case metadata.picture_extension(picture.format) {
          None -> task.ok(None)
          Some(extension) -> {
            let album = option.unwrap(meta.album, "") |> string.trim
            let key =
              "covers/"
              <> crypto.md5_hex(string.lowercase(
                metadata.album_artist(meta) <> " - " <> album,
              ))
              <> "."
              <> extension
            use bytes <- task.then(
              files.from_bytes(picture.data) |> error.map_js |> task.from_result,
            )
            use _ <- task.map(
              s3.put_object(
                stream.managed_client(ctx),
                ctx.env.s3_covers_bucket_name,
                key,
                bytes,
                picture.format,
              )
              |> task.attempt_result,
            )
            Some(ctx.env.cdn_url <> "/" <> key)
          }
        }
    }
  }
  task.rescue(work, fn(e) {
    log.warn(
      "[uploads] album art upload failed, continuing without it: "
      <> error.describe(e),
    )
    task.ok(None)
  })
}

fn ingest(
  ctx: Context,
  c: hono.Context,
  user: User,
  file: hono.File,
  provider_id,
  bytes: BitArray,
  mime: String,
  meta: Metadata,
) {
  let extension = metadata.extension(mime)
  use stored <- task.then(case meta.has_gain {
    True -> task.ok(bytes)
    False -> replaygain.ensure_replay_gain(bytes, extension)
  })
  let key =
    "music/"
    <> user.id
    <> "/"
    <> crypto.sha256_hex_bytes(stored)
    <> "."
    <> extension
  let uploads = up.table()
  use duplicate <- task.then(
    from(uploads)
    |> where(
      and([eq(up.user_id(uploads), user.id), eq(up.r2_key(uploads), key)]),
    )
    |> one(ctx.db),
  )
  case duplicate {
    Some(upload) ->
      task.ok(hono.json(
        c,
        json.object([
          #("error", json.string("DUPLICATE_FILE")),
          #(
            "message",
            json.string("This exact file is already in your library"),
          ),
          #("uploadId", json.string(upload.id)),
        ]),
        409,
      ))
    None -> {
      let input = metadata.to_track(meta, None)
      let hash = crypto.sha256_hex(track.identity(input))
      let tracks = tr.table()
      use existing <- task.then(
        from(tracks) |> where(eq(tr.sha256(tracks), hash)) |> one(ctx.db),
      )
      use art <- task.then(cover(ctx, meta))
      use _ <- task.then(case existing {
        Some(_) -> task.ok(Nil)
        None -> {
          use agent <- task.then(agent.require(ctx, user.did))
          use _ <- task.then(service.save_track(
            ctx,
            track.Track(..input, album_art: art),
            agent,
          ))
          task.sleep(3000) |> promise.map(fn(_) { Ok(Nil) })
        }
      })
      use track <- task.then(
        from(tracks)
        |> where(eq(tr.sha256(tracks), hash))
        |> one(ctx.db)
        |> task.require_task("Uploaded track was not indexed"),
      )
      use provider <- task.then(storage.resolve_storage_client(
        ctx,
        user.id,
        provider_id,
      ))
      use _ <- task.then(
        s3.put_object_metadata(
          provider.client,
          provider.bucket,
          key,
          stored,
          mime,
          [
            #("userId", user.id),
            #("trackId", track.id),
            #("originalFilename", uri.percent_encode(hono.file_name(file))),
          ],
        )
        |> task.attempt_result,
      )
      use upload <- task.map(
        insert(uploads, [
          set(up.user_id(uploads), user.id),
          set(up.track_id(uploads), track.id),
          set(up.r2_key(uploads), key),
          set(up.mime_type(uploads), mime),
          set(up.file_size(uploads), bit_array.byte_size(stored)),
          set(up.original_filename(uploads), hono.file_name(file)),
          set(up.storage_provider_id(uploads), provider.storage_provider_id),
          set(up.sample_rate(uploads), meta.sample_rate),
        ])
        |> returning_one(ctx.db, "Upload insert failed"),
      )
      case
        track.key == None
        || track.bpm == None
        || track.acoustid_fingerprint == None
      {
        True ->
          task.background(
            analysis.analyze_upload_audio(ctx, stored, extension, track.id),
            fn(e) {
              log.warn("[analysis] unexpected failure: " <> error.describe(e))
            },
          )
        False -> Nil
      }
      task.background(
        library.index_library_track(
          ctx.typesense,
          library.LibraryTrackDocument(
            id: upload.id,
            user_id: user.id,
            track_id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            album_artist: track.album_artist,
            genre: track.genre,
            composer: track.composer,
            year: None,
            duration: track.duration,
            album_art: track.album_art,
            r2_key: key,
            mime_type: mime,
            file_size: bit_array.byte_size(stored),
            original_filename: Some(hono.file_name(file)),
            uploaded_at: row.to_unix_ms(upload.uploaded_at),
            mb_id: track.mb_id,
            track_number: track.track_number,
            disc_number: track.disc_number,
          ),
        ),
        fn(e) { log.warn("[typesense] index failed: " <> error.describe(e)) },
      )
      hono.json(
        c,
        json.object([
          #("uploadId", json.string(upload.id)),
          #("trackId", json.string(track.id)),
          #(
            "track",
            json.object([
              #("title", json.string(track.title)),
              #("artist", json.string(track.artist)),
              #("album", json.string(track.album)),
              #("duration", json.int(track.duration)),
              #("genre", json.nullable(track.genre, json.string)),
            ]),
          ),
        ]),
        200,
      )
    }
  }
}

fn parse_and_ingest(
  ctx: Context,
  c: hono.Context,
  user: User,
  form: hono.FormData,
  file: hono.File,
) {
  use bytes <- task.then(hono.file_bytes(file) |> task.attempt_result)
  case metadata.detect_mime(bytes) {
    None ->
      task.ok(failure(
        c,
        400,
        "INVALID_FORMAT",
        "Only audio files are accepted (MP3, FLAC, M4A, OGG, WAV, AIFF)",
      ))
    Some(mime) -> {
      let parsed =
        music_metadata.parse(bytes, mime)
        |> task.attempt_result
        |> task.try_map(fn(data) {
          decode.run(data, metadata.decoder())
          |> error.decode("Audio metadata", _)
        })
      use parsed <- promise.await(parsed)
      case parsed {
        Error(e) -> {
          log.error("[uploads] metadata parse error: " <> error.describe(e))
          task.ok(failure(
            c,
            422,
            "METADATA_PARSE_FAILED",
            "Could not read audio tags from this file",
          ))
        }
        Ok(meta) -> {
          case
            list.all([meta.title, meta.artist, meta.album], fn(v) {
              v == None || v == Some("")
            })
          {
            True ->
              task.ok(failure(
                c,
                422,
                "NO_TAGS",
                "No audio tags found in this file. Please tag your file before uploading.",
              ))
            False ->
              case metadata.missing(meta) {
                [] -> {
                  let provider = case
                    hono.form_string(form, "storage_provider_id")
                  {
                    Some("") -> None
                    other -> other
                  }
                  ingest(ctx, c, user, file, provider, bytes, mime, meta)
                }
                missing ->
                  task.ok(hono.json(
                    c,
                    json.object([
                      #("error", json.string("INCOMPLETE_METADATA")),
                      #(
                        "message",
                        json.string(
                          "Missing required tags: "
                          <> string.join(missing, ", ")
                          <> ". Please tag your file before uploading.",
                        ),
                      ),
                      #("missingFields", json.array(missing, json.string)),
                    ]),
                    422,
                  ))
              }
          }
        }
      }
    }
  }
}

pub fn upload(ctx: Context, c: hono.Context) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    use form <- promise.await(hono.form_data(c))
    case form {
      Error(_) -> task.ok(hono.text(c, "Invalid multipart form data", 400))
      Ok(form) ->
        case hono.form_file(form, "file") {
          None -> task.ok(failure(c, 400, "NO_FILE", "No file provided"))
          Some(file) -> parse_and_ingest(ctx, c, user, form, file)
        }
    }
  }
  respond.with(c, work, fn(r) { r })
}
