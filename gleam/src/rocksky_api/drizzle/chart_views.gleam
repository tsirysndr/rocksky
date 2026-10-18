import gleam/dynamic/decode
import gleam/option.{type Option}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  type Table, column, integer, optional, table as db_table, text,
}

pub type Count {
  Count(id: Option(String), plays: Int, listeners: Int)
}

pub fn table(artist: Bool) {
  let #(name, id_column) = case artist {
    True -> #("chart_artists_mv", "artist_id")
    False -> #("chart_tracks_mv", "track_id")
  }
  let decoder = {
    use id <- decode.field(id_column, decode.optional(decode.string))
    use plays <- decode.field("scrobbles", row.int())
    use listeners <- decode.field("unique_listeners", row.int())
    decode.success(Count(id, plays, listeners))
  }
  db_table(name, decoder)
}

pub fn id(table: Table(Count)) {
  column(table, "id", optional(text()))
}

pub fn plays(table: Table(Count)) {
  column(table, "scrobbles", integer())
}

pub fn listeners(table: Table(Count)) {
  column(table, "uniqueListeners", integer())
}
