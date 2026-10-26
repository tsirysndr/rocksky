import gleam/dict.{type Dict}
import gleam/float
import gleam/int
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/node

pub type Settings {
  Settings(
    volume: Float,
    shuffle: Bool,
    repeat: Int,
    output: String,
    mpd_enabled: Bool,
    mpd_port: Int,
    mpd_bind: String,
    remote_name: String,
    eq_enabled: Bool,
    bands: List(Int),
    bass: Int,
    treble: Int,
    crossfade: Int,
    fade_in_delay: Int,
    fade_in_duration: Int,
    fade_out_delay: Int,
    fade_out_duration: Int,
    mix_mode: Int,
    replaygain: Int,
    replaygain_preamp: Int,
    replaygain_clip: Bool,
  )
}

pub fn defaults() -> Settings {
  Settings(
    0.9,
    False,
    0,
    "",
    False,
    6600,
    "127.0.0.1",
    "Rocksky CLI",
    False,
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    0,
    0,
    5,
    0,
    6,
    0,
    6,
    1,
    0,
    0,
    True,
  )
}

pub fn parse(text: String) -> Dict(String, String) {
  text
  |> string.split("\n")
  |> list.fold(#("", dict.new()), fn(acc, line) {
    let line = string.trim(line)
    case line {
      "" -> acc
      "#" <> _ -> acc
      "[" <> rest -> #(string.drop_end(rest, 1) <> ".", acc.1)
      _ ->
        case string.split_once(line, "=") {
          Error(_) -> acc
          Ok(#(key, value)) -> #(
            acc.0,
            dict.insert(acc.1, acc.0 <> string.trim(key), string.trim(value)),
          )
        }
    }
  })
  |> fn(acc) { acc.1 }
}

fn raw(data: Dict(String, String), key: String, default: String) -> String {
  dict.get(data, key) |> result.unwrap(default)
}

fn number(data: Dict(String, String), key: String, default: Int) -> Int {
  raw(data, key, "") |> int.parse |> result.unwrap(default)
}

fn boolean(data: Dict(String, String), key: String, default: Bool) -> Bool {
  case raw(data, key, "") {
    "true" -> True
    "false" -> False
    _ -> default
  }
}

fn text(data: Dict(String, String), key: String, default: String) -> String {
  case raw(data, key, "") {
    "\"" <> rest -> string.drop_end(rest, 1)
    _ -> default
  }
}

pub fn decode(source: String) -> Settings {
  let d = parse(source)
  let bands =
    raw(d, "equalizer.bands", "")
    |> string.replace("[", "")
    |> string.replace("]", "")
    |> string.split(",")
    |> list.map(fn(v) { int.parse(string.trim(v)) |> result.unwrap(0) })
  Settings(
    volume: raw(d, "volume", "")
      |> float.parse
      |> result.unwrap(0.9)
      |> float.clamp(0.0, 1.0),
    shuffle: boolean(d, "shuffle", False),
    repeat: case text(d, "repeat", "") {
      "one" -> 1
      "all" -> 2
      _ -> 0
    },
    output: text(d, "output", ""),
    mpd_enabled: boolean(d, "mpd.enabled", False),
    mpd_port: number(d, "mpd.port", 6600),
    mpd_bind: text(d, "mpd.bind", "127.0.0.1"),
    remote_name: text(d, "remote.name", "Rocksky CLI"),
    eq_enabled: boolean(d, "equalizer.enabled", False),
    bands: list.take(list.append(bands, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 10),
    bass: number(d, "equalizer.bass", 0),
    treble: number(d, "equalizer.treble", 0),
    crossfade: number(d, "equalizer.crossfade", 5),
    fade_in_delay: number(d, "equalizer.fadeInDelay", 0),
    fade_in_duration: number(d, "equalizer.fadeInDuration", 6),
    fade_out_delay: number(d, "equalizer.fadeOutDelay", 0),
    fade_out_duration: number(d, "equalizer.fadeOutDuration", 6),
    mix_mode: number(d, "equalizer.mixMode", 1),
    replaygain: number(d, "equalizer.replaygain", 0),
    replaygain_preamp: number(d, "equalizer.replaygainPreamp", 0),
    replaygain_clip: boolean(d, "equalizer.replaygainClip", True),
  )
}

pub fn load() -> Settings {
  node.read(node.state_path("settings.toml"))
  |> result.map(decode)
  |> result.unwrap(defaults())
}

fn bool(value: Bool) -> String {
  case value {
    True -> "true"
    False -> "false"
  }
}

pub fn encode(s: Settings) -> String {
  [
    "volume = " <> float.to_string(s.volume),
    "shuffle = " <> bool(s.shuffle),
    "repeat = \""
      <> case s.repeat {
      1 -> "one"
      2 -> "all"
      _ -> "off"
    }
      <> "\"",
    "output = \"" <> s.output <> "\"",
    "[mpd]",
    "enabled = " <> bool(s.mpd_enabled),
    "port = " <> int.to_string(s.mpd_port),
    "bind = \"" <> s.mpd_bind <> "\"",
    "[remote]",
    "name = \"" <> s.remote_name <> "\"",
    "[equalizer]",
    "enabled = " <> bool(s.eq_enabled),
    "bands = ["
      <> { s.bands |> list.map(int.to_string) |> string.join(", ") }
      <> "]",
    "bass = " <> int.to_string(s.bass),
    "treble = " <> int.to_string(s.treble),
    "crossfade = " <> int.to_string(s.crossfade),
    "fadeInDelay = " <> int.to_string(s.fade_in_delay),
    "fadeInDuration = " <> int.to_string(s.fade_in_duration),
    "fadeOutDelay = " <> int.to_string(s.fade_out_delay),
    "fadeOutDuration = " <> int.to_string(s.fade_out_duration),
    "mixMode = " <> int.to_string(s.mix_mode),
    "replaygain = " <> int.to_string(s.replaygain),
    "replaygainPreamp = " <> int.to_string(s.replaygain_preamp),
    "replaygainClip = " <> bool(s.replaygain_clip),
    "",
  ]
  |> string.join("\n")
}

pub fn save(s: Settings) -> Nil {
  let disk = load()
  let _ =
    node.write(
      node.state_path("settings.toml"),
      encode(
        Settings(
          ..s,
          output: disk.output,
          mpd_enabled: disk.mpd_enabled,
          mpd_port: disk.mpd_port,
          mpd_bind: disk.mpd_bind,
          remote_name: disk.remote_name,
        ),
      ),
    )
  Nil
}
