# frozen_string_literal: true

require_relative "test_helper"

# Hermetic: only the standalone filter — never `require "rocksky"`, which
# dlloads the native core.
require "rocksky/filter"

class FilterTest < Minitest::Test
  F = Rocksky::Filter

  # ---- comparisons ----

  def test_eq_bare_value
    assert_equal "artist==Radiohead", F.eq(:artist, "Radiohead").build
  end

  def test_eq_quotes_value_with_space
    assert_equal 'artist=="Daft Punk"', F.eq(:artist, "Daft Punk").build
  end

  def test_eq_escapes_embedded_double_quotes
    assert_equal "title==\"He said \\\"hi\\\"\"", F.eq(:title, 'He said "hi"').build
  end

  def test_eq_keeps_wildcard_unquoted
    assert_equal "artist==Daft*", F.eq(:artist, "Daft*").build
  end

  def test_ne
    assert_equal "artist!=Eminem", F.ne(:artist, "Eminem").build
  end

  def test_gt
    assert_equal "duration=gt=200000", F.gt(:duration, 200_000).build
  end

  def test_ge
    assert_equal "year=ge=2000", F.ge(:year, 2000).build
  end

  def test_lt
    assert_equal "trackNumber=lt=5", F.lt(:trackNumber, 5).build
  end

  def test_le
    assert_equal "year=le=1999", F.le(:year, 1999).build
  end

  def test_is_in
    assert_equal "genre=in=(house,electro)", F.is_in(:genre, %w[house electro]).build
  end

  def test_is_out_quotes_values_with_spaces
    assert_equal 'genre=out=("hip hop")', F.is_out(:genre, ["hip hop"]).build
  end

  def test_is_null
    assert_equal "uri==null", F.is_null(:uri).build
  end

  def test_is_not_null
    assert_equal "uri!=null", F.is_not_null(:uri).build
  end

  def test_boolean_value_is_bare
    assert_equal "liked==true", F.eq(:liked, true).build
  end

  def test_dotted_field_symbol
    assert_equal 'track.artist=="Daft Punk"', F.eq(:"track.artist", "Daft Punk").build
  end

  # ---- combinators ----

  def test_and_chain
    built = F.eq(:artist, "Radiohead").and(F.gt(:duration, 200_000)).build
    assert_equal "artist==Radiohead;duration=gt=200000", built
  end

  def test_or_chain
    built = F.eq(:artist, "Radiohead").or(F.eq(:artist, "Muse")).build
    assert_equal "artist==Radiohead,artist==Muse", built
  end

  def test_or_then_and_parenthesizes_left_or_operand
    built = F.eq(:artist, "Radiohead")
             .or(F.eq(:artist, "Muse"))
             .and(F.gt(:duration, 200_000))
             .build
    assert_equal "(artist==Radiohead,artist==Muse);duration=gt=200000", built
  end

  def test_and_parenthesizes_right_or_operand
    built = F.eq(:artist, "Radiohead")
             .and(F.eq(:genre, "house").or(F.eq(:genre, "electro")))
             .build
    assert_equal "artist==Radiohead;(genre==house,genre==electro)", built
  end

  def test_and_then_or_adds_no_parentheses
    built = F.eq(:artist, "Radiohead")
             .and(F.gt(:duration, 200_000))
             .or(F.eq(:genre, "house"))
             .build
    assert_equal "artist==Radiohead;duration=gt=200000,genre==house", built
  end

  # ---- validation, aliases and field types ----

  def test_is_in_empty_list_raises
    assert_raises(ArgumentError) { F.is_in(:genre, []) }
  end

  def test_is_out_empty_list_raises
    assert_raises(ArgumentError) { F.is_out(:genre, []) }
  end

  def test_in_and_out_aliases
    assert_equal F.is_in(:genre, %w[house]).build, F.in(:genre, %w[house]).build
    assert_equal F.is_out(:genre, %w[house]).build, F.out(:genre, %w[house]).build
  end

  def test_string_field_equivalent_to_symbol_field
    assert_equal F.eq(:artist, "Radiohead").build, F.eq("artist", "Radiohead").build
    assert_equal F.eq(:"track.artist", "Daft Punk").build,
                 F.eq("track.artist", "Daft Punk").build
  end

  def test_to_s_aliases_build
    filter = F.eq(:artist, "Radiohead")
    assert_equal filter.build, filter.to_s
  end
end
