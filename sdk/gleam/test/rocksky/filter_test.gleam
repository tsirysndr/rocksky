//// Canonical RSQL builder vectors — identical output across every Rocksky SDK.

import gleeunit/should
import rocksky/filter

// ---- comparisons ---------------------------------------------------------

pub fn eq_bare_test() {
  filter.eq(filter.Artist, "Radiohead")
  |> filter.build
  |> should.equal("artist==Radiohead")
}

pub fn eq_quoted_test() {
  filter.eq(filter.Artist, "Daft Punk")
  |> filter.build
  |> should.equal("artist==\"Daft Punk\"")
}

pub fn eq_escaped_test() {
  filter.eq(filter.Title, "He said \"hi\"")
  |> filter.build
  |> should.equal("title==\"He said \\\"hi\\\"\"")
}

pub fn eq_wildcard_test() {
  filter.eq(filter.Artist, "Daft*")
  |> filter.build
  |> should.equal("artist==Daft*")
}

pub fn eq_dotted_field_test() {
  filter.eq(filter.TrackArtist, "Daft Punk")
  |> filter.build
  |> should.equal("track.artist==\"Daft Punk\"")
}

pub fn eq_custom_field_bool_test() {
  filter.eq_bool(filter.CustomField("liked"), True)
  |> filter.build
  |> should.equal("liked==true")
}

pub fn ne_test() {
  filter.ne(filter.Artist, "Eminem")
  |> filter.build
  |> should.equal("artist!=Eminem")
}

pub fn gt_test() {
  filter.gt(filter.Duration, 200_000)
  |> filter.build
  |> should.equal("duration=gt=200000")
}

pub fn ge_test() {
  filter.ge(filter.Year, 2000)
  |> filter.build
  |> should.equal("year=ge=2000")
}

pub fn lt_test() {
  filter.lt(filter.TrackNumber, 5)
  |> filter.build
  |> should.equal("trackNumber=lt=5")
}

pub fn le_test() {
  filter.le(filter.Year, 1999)
  |> filter.build
  |> should.equal("year=le=1999")
}

pub fn in_list_test() {
  filter.in_list(filter.Genre, ["house", "electro"])
  |> filter.build
  |> should.equal("genre=in=(house,electro)")
}

pub fn out_list_quoted_test() {
  filter.out_list(filter.Genre, ["hip hop"])
  |> filter.build
  |> should.equal("genre=out=(\"hip hop\")")
}

pub fn is_null_test() {
  filter.is_null(filter.Uri)
  |> filter.build
  |> should.equal("uri==null")
}

pub fn is_not_null_test() {
  filter.is_not_null(filter.Uri)
  |> filter.build
  |> should.equal("uri!=null")
}

// ---- combinators ---------------------------------------------------------

pub fn and_test() {
  filter.eq(filter.Artist, "Radiohead")
  |> filter.and(filter.gt(filter.Duration, 200_000))
  |> filter.build
  |> should.equal("artist==Radiohead;duration=gt=200000")
}

pub fn or_test() {
  filter.eq(filter.Artist, "Radiohead")
  |> filter.or(filter.eq(filter.Artist, "Muse"))
  |> filter.build
  |> should.equal("artist==Radiohead,artist==Muse")
}

pub fn or_then_and_parenthesizes_test() {
  filter.eq(filter.Artist, "Radiohead")
  |> filter.or(filter.eq(filter.Artist, "Muse"))
  |> filter.and(filter.gt(filter.Duration, 200_000))
  |> filter.build
  |> should.equal("(artist==Radiohead,artist==Muse);duration=gt=200000")
}

pub fn and_with_or_operand_parenthesizes_test() {
  filter.eq(filter.Artist, "Radiohead")
  |> filter.and(
    filter.eq(filter.Genre, "house")
    |> filter.or(filter.eq(filter.Genre, "electro")),
  )
  |> filter.build
  |> should.equal("artist==Radiohead;(genre==house,genre==electro)")
}

pub fn and_then_or_no_parens_test() {
  filter.eq(filter.Artist, "Radiohead")
  |> filter.and(filter.gt(filter.Duration, 200_000))
  |> filter.or(filter.eq(filter.Genre, "house"))
  |> filter.build
  |> should.equal("artist==Radiohead;duration=gt=200000,genre==house")
}
