defmodule Rocksky.FilterTest do
  use ExUnit.Case, async: true

  alias Rocksky.Filter

  doctest Rocksky.Filter

  describe "comparisons" do
    test "eq with a safe string stays bare" do
      assert Filter.eq(:artist, "Radiohead") |> Filter.build() == "artist==Radiohead"
    end

    test "eq quotes a string containing a space" do
      assert Filter.eq(:artist, "Daft Punk") |> Filter.build() == "artist==\"Daft Punk\""
    end

    test "eq escapes embedded double quotes" do
      assert Filter.eq(:title, ~s(He said "hi")) |> Filter.build() ==
               ~s(title=="He said \\"hi\\"")
    end

    test "eq keeps * wildcards unquoted" do
      assert Filter.eq(:artist, "Daft*") |> Filter.build() == "artist==Daft*"
    end

    test "ne" do
      assert Filter.ne(:artist, "Eminem") |> Filter.build() == "artist!=Eminem"
    end

    test "gt renders integers without decimals" do
      assert Filter.gt(:duration, 200_000) |> Filter.build() == "duration=gt=200000"
    end

    test "ge" do
      assert Filter.ge(:year, 2000) |> Filter.build() == "year=ge=2000"
    end

    test "lt" do
      assert Filter.lt(:trackNumber, 5) |> Filter.build() == "trackNumber=lt=5"
    end

    test "le" do
      assert Filter.le(:year, 1999) |> Filter.build() == "year=le=1999"
    end

    test "eq with a boolean" do
      assert Filter.eq(:liked, true) |> Filter.build() == "liked==true"
    end

    test "dotted atom selectors" do
      assert Filter.eq(:"track.artist", "Daft Punk") |> Filter.build() ==
               "track.artist==\"Daft Punk\""
    end

    test "binary fields are accepted too" do
      assert Filter.eq("artist", "Radiohead") |> Filter.build() == "artist==Radiohead"
      assert Filter.gt("track.duration", 200_000) |> Filter.build() == "track.duration=gt=200000"
    end
  end

  describe "in / out" do
    test "is_in" do
      assert Filter.is_in(:genre, ["house", "electro"]) |> Filter.build() ==
               "genre=in=(house,electro)"
    end

    test "is_out quotes values with reserved characters" do
      assert Filter.is_out(:genre, ["hip hop"]) |> Filter.build() == ~s|genre=out=("hip hop")|
    end

    test "is_in with an empty list raises" do
      assert_raise ArgumentError, fn -> Filter.is_in(:genre, []) end
    end

    test "is_out with an empty list raises" do
      assert_raise ArgumentError, fn -> Filter.is_out(:genre, []) end
    end
  end

  describe "null checks" do
    test "is_null" do
      assert Filter.is_null(:uri) |> Filter.build() == "uri==null"
    end

    test "is_not_null" do
      assert Filter.is_not_null(:uri) |> Filter.build() == "uri!=null"
    end
  end

  describe "combinators" do
    test "and_ joins with ;" do
      assert Filter.eq(:artist, "Radiohead")
             |> Filter.and_(Filter.gt(:duration, 200_000))
             |> Filter.build() == "artist==Radiohead;duration=gt=200000"
    end

    test "or_ joins with ," do
      assert Filter.eq(:artist, "Radiohead")
             |> Filter.or_(Filter.eq(:artist, "Muse"))
             |> Filter.build() == "artist==Radiohead,artist==Muse"
    end

    test "and_ parenthesizes an or left operand" do
      assert Filter.eq(:artist, "Radiohead")
             |> Filter.or_(Filter.eq(:artist, "Muse"))
             |> Filter.and_(Filter.gt(:duration, 200_000))
             |> Filter.build() == "(artist==Radiohead,artist==Muse);duration=gt=200000"
    end

    test "and_ parenthesizes an or right operand" do
      assert Filter.eq(:artist, "Radiohead")
             |> Filter.and_(Filter.eq(:genre, "house") |> Filter.or_(Filter.eq(:genre, "electro")))
             |> Filter.build() == "artist==Radiohead;(genre==house,genre==electro)"
    end

    test "or_ never parenthesizes" do
      assert Filter.eq(:artist, "Radiohead")
             |> Filter.and_(Filter.gt(:duration, 200_000))
             |> Filter.or_(Filter.eq(:genre, "house"))
             |> Filter.build() == "artist==Radiohead;duration=gt=200000,genre==house"
    end
  end

  describe "build/1" do
    test "accepts a plain binary as identity" do
      assert Filter.build("artist==Radiohead") == "artist==Radiohead"
    end
  end
end
