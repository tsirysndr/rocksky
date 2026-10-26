import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/node
import rocksky_cli/value

pub type ScrobbleId {
  ScrobbleId(timestamp: Int, title: String, artist: String)
}

pub type Tracker {
  Tracker(mark: Int, done: Dict(Int, Bool))
}

pub fn new() -> Tracker {
  Tracker(-1, dict.new())
}

pub fn complete(tracker: Tracker, index: Int) -> Tracker {
  case index <= tracker.mark {
    True -> tracker
    False ->
      advance(Tracker(tracker.mark, dict.insert(tracker.done, index, True)))
  }
}

fn advance(tracker: Tracker) -> Tracker {
  case dict.has_key(tracker.done, tracker.mark + 1) {
    True ->
      advance(Tracker(
        tracker.mark + 1,
        dict.delete(tracker.done, tracker.mark + 1),
      ))
    False -> tracker
  }
}

pub fn outstanding(tracker: Tracker) -> List(Int) {
  dict.keys(tracker.done) |> list.sort(int.compare)
}

pub fn identity(track: Dynamic) -> ScrobbleId {
  ScrobbleId(
    value.integer(track, "timestamp", 0),
    value.string(track, "title"),
    value.string(track, "artist"),
  )
}

pub fn resume_index(tracks: List(ScrobbleId), cursor: ScrobbleId) -> Int {
  tracks
  |> list.index_map(fn(track, index) { #(track, index) })
  |> list.find(fn(pair) { pair.0 == cursor })
  |> result.map(fn(pair) { pair.1 + 1 })
  |> result.unwrap(0)
}

pub fn restore(tracks: List(Dynamic), saved: Dynamic) -> #(Tracker, List(Int)) {
  let cursor = value.field(saved, "cursor")
  let start = case value.is_null(cursor) {
    True -> 0
    False -> resume_index(list.map(tracks, identity), identity(cursor))
  }
  let done =
    value.field(saved, "completed")
    |> value.items
    |> list.map(identity)
    |> list.map(fn(id) { #(id, True) })
    |> dict.from_list
  tracks
  |> list.index_map(fn(track, index) { #(track, index) })
  |> list.fold(#(new(), []), fn(acc, pair) {
    case pair.1 < start || dict.has_key(done, identity(pair.0)) {
      True -> #(complete(acc.0, pair.1), acc.1)
      False -> #(acc.0, [pair.1, ..acc.1])
    }
  })
  |> fn(acc) { #(acc.0, list.reverse(acc.1)) }
}

pub fn path(source: String) -> String {
  node.state_path(
    "import-checkpoints/"
    <> string.slice(node.hash(node.absolute(source), "sha1"), 0, 16)
    <> ".json",
  )
}

pub fn load(source: String) -> Dynamic {
  node.read(path(source))
  |> result.try(value.parse)
  |> result.unwrap(value.null())
}

fn id_json(track: Dynamic) -> List(#(String, json.Json)) {
  let id = identity(track)
  [
    #("timestamp", json.int(id.timestamp)),
    #("title", json.string(id.title)),
    #("artist", json.string(id.artist)),
  ]
}

pub fn save(
  source: String,
  format: String,
  tracks: List(Dynamic),
  tracker: Tracker,
) -> Result(Nil, String) {
  let cursor = case list.first(list.drop(tracks, tracker.mark)) {
    Ok(track) if tracker.mark >= 0 ->
      json.object([#("count", json.int(tracker.mark + 1)), ..id_json(track)])
    _ -> json.null()
  }
  let completed =
    outstanding(tracker)
    |> list.filter_map(fn(i) { list.first(list.drop(tracks, i)) })
    |> list.map(fn(track) { json.object(id_json(track)) })
  let body =
    json.object([
      #("source", json.string(node.absolute(source))),
      #("format", json.string(format)),
      #("cursor", cursor),
      #("completed", json.array(completed, fn(x) { x })),
      #("updatedAt", json.string(node.iso_date(node.now()))),
    ])
  node.write(path(source), json.to_string(body))
}
