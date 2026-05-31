//// Tests for the internal query-param helpers and percent-encoder.

import gleam/option.{None, Some}
import gleeunit/should
import rocksky/internal/query

pub fn encode_empty_test() {
  query.encode([])
  |> should.equal("")
}

pub fn encode_single_test() {
  query.encode([#("did", "did:plc:abc")])
  |> should.equal("?did=did%3Aplc%3Aabc")
}

pub fn encode_preserves_order_test() {
  // Pipeline-built params end up reversed internally; encode() compensates.
  let params =
    [#("did", "alice")]
    |> query.maybe_int("limit", Some(50))
    |> query.maybe_int("offset", Some(10))
  query.encode(params)
  |> should.equal("?did=alice&limit=50&offset=10")
}

pub fn maybe_string_none_is_noop_test() {
  let params =
    [#("a", "1")]
    |> query.maybe_string("b", None)
  params
  |> should.equal([#("a", "1")])
}

pub fn maybe_string_some_appends_test() {
  let params =
    [#("a", "1")]
    |> query.maybe_string("b", Some("2"))
  params
  |> should.equal([#("b", "2"), #("a", "1")])
}

pub fn maybe_int_some_appends_test() {
  let params =
    []
    |> query.maybe_int("limit", Some(10))
  params
  |> should.equal([#("limit", "10")])
}

pub fn maybe_bool_some_appends_test() {
  let params =
    []
    |> query.maybe_bool("following", Some(True))
  params
  |> should.equal([#("following", "true")])
}

pub fn repeated_string_expands_test() {
  let params =
    []
    |> query.repeated_string("dids", ["did:plc:a", "did:plc:b"])
  // Order is reversed by fold (most recent first); encode() reverses back.
  query.encode(params)
  |> should.equal("?dids=did%3Aplc%3Aa&dids=did%3Aplc%3Ab")
}

pub fn percent_encodes_spaces_and_unicode_test() {
  query.percent_encode("hello world")
  |> should.equal("hello%20world")

  // 'é' is 0xC3 0xA9 in UTF-8.
  query.percent_encode("café")
  |> should.equal("caf%C3%A9")
}

pub fn leaves_unreserved_alone_test() {
  query.percent_encode("abcABC012-._~")
  |> should.equal("abcABC012-._~")
}
