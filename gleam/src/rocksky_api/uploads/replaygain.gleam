import gleam/float
import gleam/int
import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/regexp
import gleam/result
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/files
import rocksky_api/node/process
import rocksky_api/node/subprocess
import rocksky_api/node/taglib
import rocksky_api/task

pub type TrackGain {
  TrackGain(gain_db: Float, peak: Float)
}

pub fn supported(extension: String) {
  list.contains(["mp3", "flac", "m4a", "ogg"], extension)
}

fn number_match(output: String, pattern: String) {
  let assert Ok(regex) = regexp.from_string(pattern)
  use matched <- result.try(regexp.scan(regex, output) |> list.first)
  use group <- result.try(list.first(matched.submatches))
  use number <- result.try(option.to_result(group, Nil))
  case int.parse(number) {
    Ok(v) -> Ok(int.to_float(v))
    Error(_) -> float.parse(number)
  }
}

pub fn parse(output: String) -> Option(TrackGain) {
  case
    number_match(output, "track_gain\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?)\\s*dB"),
    number_match(output, "track_peak\\s*=\\s*(\\d+(?:\\.\\d+)?)")
  {
    Ok(gain), Ok(peak) -> Some(TrackGain(gain, peak))
    _, _ -> None
  }
}

pub fn analyze_track_gain(path: String) {
  subprocess.run(
    option.unwrap(process.env("FFMPEG_PATH"), "ffmpeg"),
    [
      "-hide_banner",
      "-nostats",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-af",
      "replaygain",
      "-f",
      "null",
      "-",
    ],
    120_000,
  )
  |> task.attempt_result
  |> task.map(fn(output) {
    case output.code {
      0 -> parse(output.stderr)
      _ -> None
    }
  })
  |> task.rescue(fn(_) { task.ok(None) })
}

pub fn write_track_gain(path: String, gain: TrackGain) {
  taglib.write_track_gain(path, gain.gain_db, gain.peak)
  |> error.map_js
  |> task.from_result
}

pub fn ensure_replay_gain(bytes: BitArray, extension: String) {
  case supported(extension) {
    False -> task.ok(bytes)
    True -> {
      let work = {
        use directory <- task.then(
          files.temporary_directory("rocksky-rg-") |> task.attempt_result,
        )
        let path = directory <> "/audio." <> extension
        let tagging = {
          use _ <- task.then(files.write(path, bytes) |> task.attempt_result)
          use gain <- task.then(analyze_track_gain(path))
          case gain {
            None -> {
              log.warn("[uploads] replaygain analysis failed, storing untagged")
              task.ok(bytes)
            }
            Some(gain) -> {
              use _ <- task.then(write_track_gain(path, gain))
              files.read(path) |> task.attempt_result
            }
          }
        }
        use outcome <- promise.await(tagging)
        use _ <- promise.await(files.remove_tree(directory))
        task.from_result(outcome)
      }
      task.rescue(work, fn(e) {
        log.warn(
          "[uploads] replaygain tagging failed, storing untagged: "
          <> error.describe(e),
        )
        task.ok(bytes)
      })
    }
  }
}
