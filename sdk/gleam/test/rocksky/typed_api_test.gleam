import gleam/json
import gleam/option.{None, Some}
import gleeunit/should
import rocksky/models
import rocksky/json_value

pub fn required_params_test() {
  json.parse("{}", models.get_actor_scrobbles_params_decoder())
  |> should.be_error
}
pub fn params_encode_test() {
  let params = models.new_get_actor_scrobbles_params("alice.test")
  let encoded = models.encode_get_actor_scrobbles_params(models.GetActorScrobblesParams(..params, limit: Some(20)))
  json.to_string(encoded) |> should.equal("{\"did\":\"alice.test\",\"limit\":20}")
}
pub fn nullable_arrays_test() {
  let assert Ok(song) = json.parse("{\"title\":\"Track\",\"bpm\":123.5,\"mbId\":null}", models.song_view_detailed_decoder())
  song.title |> should.equal(Some("Track"))
  song.bpm |> should.equal(Some(123.5))
  song.mb_id |> should.equal(None)
}
pub fn nested_discogs_test() {
  let assert Ok(album) = json.parse("{\"discogs\":{\"releaseId\":123,\"formats\":[\"Vinyl\"],\"credits\":[{\"name\":\"Producer\"}]} }", models.album_view_detailed_decoder())
  let assert Some(discogs) = album.discogs
  discogs.release_id |> should.equal(Some(123))
  discogs.formats |> should.equal(Some(["Vinyl"]))
}
pub fn malformed_optional_field_test() {
  json.parse("{\"title\":42}", models.song_view_detailed_decoder()) |> should.be_error
  json.parse("{\"discogs\":{\"formats\":[42]}}", models.album_view_detailed_decoder()) |> should.be_error
}
pub fn open_json_roundtrip_test() {
  let wire = "{\"provider\":[null,true,42,2.5,\"data\"]}"
  let assert Ok(value) = json.parse(wire, json_value.decoder())
  json.parse(json.to_string(json_value.encode(value)), json_value.decoder()) |> should.equal(Ok(value))
}
