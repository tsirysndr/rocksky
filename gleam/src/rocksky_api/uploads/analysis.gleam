import gleam/dynamic/decode
import gleam/option.{type Option, None}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  coalesce_optional, eq, optional, real, run, set_expression, text, update,
  value,
}
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/audio_analysis
import rocksky_api/task

pub type Analysis {
  Analysis(key: Option(String), bpm: Option(Float), fingerprint: Option(String))
}

pub fn store_track_analysis(
  ctx: Context,
  track_id: String,
  analysis: Analysis,
) {
  case analysis {
    Analysis(None, None, None) -> task.ok(Nil)
    _ -> {
      let tracks = t.table()
      update(
        tracks,
        [
          set_expression(
            t.key(tracks),
            coalesce_optional(
              t.key(tracks),
              value(analysis.key, optional(text())),
            ),
          ),
          set_expression(
            t.bpm(tracks),
            coalesce_optional(
              t.bpm(tracks),
              value(analysis.bpm, optional(real())),
            ),
          ),
          set_expression(
            t.acoustid_fingerprint(tracks),
            coalesce_optional(
              t.acoustid_fingerprint(tracks),
              value(analysis.fingerprint, optional(text())),
            ),
          ),
        ],
        eq(t.id(tracks), track_id),
      )
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
    }
  }
}

pub fn analyze_upload_audio(
  ctx: Context,
  bytes: BitArray,
  extension: String,
  track_id: String,
) {
  let work = {
    use module <- task.then(audio_analysis.load() |> task.attempt_result)
    use data <- task.then(
      audio_analysis.analyze(module, bytes, extension) |> task.attempt_result,
    )
    let decoder = {
      use key <- decode.optional_field(
        "key",
        None,
        decode.optional(decode.string),
      )
      use bpm <- decode.optional_field(
        "bpm",
        None,
        decode.optional(decode.float),
      )
      use fingerprint <- decode.optional_field(
        "fingerprint",
        None,
        decode.optional(decode.string),
      )
      decode.success(Analysis(key, bpm, fingerprint))
    }
    use analysis <- task.then(
      decode.run(data, decoder)
      |> error.decode("Audio analysis", _)
      |> task.from_result,
    )
    use _ <- task.map(store_track_analysis(ctx, track_id, analysis))
    log.info("[analysis] stored audio analysis for track " <> track_id)
  }
  task.rescue(work, fn(e) {
    log.warn(
      "[analysis] track " <> track_id <> " failed: " <> error.describe(e),
    )
    task.ok(Nil)
  })
}
