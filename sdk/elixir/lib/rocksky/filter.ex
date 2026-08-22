defmodule Rocksky.Filter do
  @moduledoc """
  Pipe-friendly builder for RSQL filter expressions, accepted by the `filter`
  parameter of the catalog and scrobble-feed queries
  (`app.rocksky.song.getSongs`, `app.rocksky.artist.getArtists`,
  `app.rocksky.album.getAlbums`, `app.rocksky.scrobble.getScrobbles`).

      alias Rocksky.Filter

      Filter.eq(:artist, "Daft Punk")
      |> Filter.and_(Filter.gt(:duration, 200_000))
      |> Filter.or_(Filter.is_in(:genre, ["house", "electro"]))
      |> Filter.build()
      # => artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)

  Fields are atoms — `:artist`, or `:"track.artist"` for the dotted selectors of
  the scrobble feed — though binaries are accepted too. String values are quoted
  and escaped automatically when they contain characters RSQL reserves; `*`
  wildcards pass through unquoted, so `Filter.eq(:artist, "Daft*")` performs a
  case-insensitive match.

  `and`, `or` and `in` are reserved in Elixir, hence `and_/2`, `or_/2`,
  `is_in/2` and `is_out/2`.
  """

  defstruct [:expr, :kind]

  @typedoc "An RSQL filter node: a comparison, or an `;`/`,` combination."
  @type t :: %__MODULE__{expr: String.t(), kind: :comparison | :and | :or}

  @typedoc "A filterable field, as an atom (`:artist`, `:\"track.artist\"`) or binary."
  @type field :: atom() | String.t()

  @typedoc "A comparable value: string, number or boolean."
  @type value :: String.t() | number() | boolean() | atom()

  # Characters that never need quoting in an RSQL value (`*` kept bare so wildcards work).
  @safe_value ~r/^[A-Za-z0-9_.:@*+-]+$/

  @doc ~S"""
  `field==value` — equals; `*` in string values is a wildcard.

      iex> Rocksky.Filter.eq(:artist, "Radiohead") |> Rocksky.Filter.build()
      "artist==Radiohead"

      iex> Rocksky.Filter.eq(:artist, "Daft Punk") |> Rocksky.Filter.build()
      "artist==\"Daft Punk\""
  """
  @spec eq(field(), value()) :: t()
  def eq(field, value), do: comparison(field, "==", value)

  @doc ~S"""
  `field!=value` — not equals.

      iex> Rocksky.Filter.ne(:artist, "Eminem") |> Rocksky.Filter.build()
      "artist!=Eminem"
  """
  @spec ne(field(), value()) :: t()
  def ne(field, value), do: comparison(field, "!=", value)

  @doc ~S"""
  `field=gt=value` — greater than.

      iex> Rocksky.Filter.gt(:duration, 200_000) |> Rocksky.Filter.build()
      "duration=gt=200000"
  """
  @spec gt(field(), value()) :: t()
  def gt(field, value), do: comparison(field, "=gt=", value)

  @doc ~S"""
  `field=ge=value` — greater than or equal.

      iex> Rocksky.Filter.ge(:year, 2000) |> Rocksky.Filter.build()
      "year=ge=2000"
  """
  @spec ge(field(), value()) :: t()
  def ge(field, value), do: comparison(field, "=ge=", value)

  @doc ~S"""
  `field=lt=value` — less than.

      iex> Rocksky.Filter.lt(:trackNumber, 5) |> Rocksky.Filter.build()
      "trackNumber=lt=5"
  """
  @spec lt(field(), value()) :: t()
  def lt(field, value), do: comparison(field, "=lt=", value)

  @doc ~S"""
  `field=le=value` — less than or equal.

      iex> Rocksky.Filter.le(:year, 1999) |> Rocksky.Filter.build()
      "year=le=1999"
  """
  @spec le(field(), value()) :: t()
  def le(field, value), do: comparison(field, "=le=", value)

  @doc ~S"""
  `field=in=(a,b)` — matches any of the values. Raises `ArgumentError` on an
  empty list.

      iex> Rocksky.Filter.is_in(:genre, ["house", "electro"]) |> Rocksky.Filter.build()
      "genre=in=(house,electro)"
  """
  @spec is_in(field(), [value()]) :: t()
  def is_in(field, values), do: list(field, "=in=", values)

  @doc ~S"""
  `field=out=(a,b)` — matches none of the values. Raises `ArgumentError` on an
  empty list.

      iex> Rocksky.Filter.is_out(:genre, ["rock"]) |> Rocksky.Filter.build()
      "genre=out=(rock)"
  """
  @spec is_out(field(), [value()]) :: t()
  def is_out(field, values), do: list(field, "=out=", values)

  @doc ~S"""
  `field==null` — the field is NULL.

      iex> Rocksky.Filter.is_null(:uri) |> Rocksky.Filter.build()
      "uri==null"
  """
  @spec is_null(field()) :: t()
  def is_null(field), do: %__MODULE__{expr: field_name(field) <> "==null", kind: :comparison}

  @doc ~S"""
  `field!=null` — the field is not NULL.

      iex> Rocksky.Filter.is_not_null(:uri) |> Rocksky.Filter.build()
      "uri!=null"
  """
  @spec is_not_null(field()) :: t()
  def is_not_null(field), do: %__MODULE__{expr: field_name(field) <> "!=null", kind: :comparison}

  @doc ~S"""
  Both sides must match (`;`). An `or` operand is parenthesized to keep RSQL
  precedence. Pipe-first: `a |> Filter.and_(b)`.

      iex> Rocksky.Filter.eq(:artist, "Radiohead")
      ...> |> Rocksky.Filter.and_(Rocksky.Filter.gt(:duration, 200_000))
      ...> |> Rocksky.Filter.build()
      "artist==Radiohead;duration=gt=200000"
  """
  @spec and_(t(), t()) :: t()
  def and_(%__MODULE__{} = left, %__MODULE__{} = right),
    do: %__MODULE__{expr: group(left) <> ";" <> group(right), kind: :and}

  @doc ~S"""
  Either side may match (`,`). Pipe-first: `a |> Filter.or_(b)`.

      iex> Rocksky.Filter.eq(:artist, "Radiohead")
      ...> |> Rocksky.Filter.or_(Rocksky.Filter.eq(:artist, "Muse"))
      ...> |> Rocksky.Filter.build()
      "artist==Radiohead,artist==Muse"
  """
  @spec or_(t(), t()) :: t()
  def or_(%__MODULE__{} = left, %__MODULE__{} = right),
    do: %__MODULE__{expr: left.expr <> "," <> right.expr, kind: :or}

  @doc ~S"""
  The RSQL expression string to send as the `filter` query param. Also accepts
  a plain binary (identity), so query functions can take either.

      iex> Rocksky.Filter.build("artist==Radiohead")
      "artist==Radiohead"
  """
  @spec build(t() | String.t()) :: String.t()
  def build(%__MODULE__{expr: expr}), do: expr
  def build(expr) when is_binary(expr), do: expr

  # ---- internals -----------------------------------------------------------

  defp comparison(field, op, value),
    do: %__MODULE__{expr: field_name(field) <> op <> render_value(value), kind: :comparison}

  defp list(field, op, []) do
    name = if op == "=in=", do: "is_in", else: "is_out"
    raise ArgumentError, "Rocksky.Filter.#{name}(#{inspect(field)}, ...) needs at least one value"
  end

  defp list(field, op, values) when is_list(values) do
    %__MODULE__{
      expr: field_name(field) <> op <> "(" <> Enum.map_join(values, ",", &render_value/1) <> ")",
      kind: :comparison
    }
  end

  # An `or` node is parenthesized when AND-combined; everything else stays bare.
  defp group(%__MODULE__{expr: expr, kind: :or}), do: "(" <> expr <> ")"
  defp group(%__MODULE__{expr: expr}), do: expr

  defp field_name(field) when is_atom(field), do: Atom.to_string(field)
  defp field_name(field) when is_binary(field), do: field

  defp render_value(value) when is_integer(value), do: Integer.to_string(value)
  defp render_value(value) when is_float(value), do: to_string(value)
  defp render_value(true), do: "true"
  defp render_value(false), do: "false"
  defp render_value(value) when is_atom(value), do: render_value(Atom.to_string(value))

  defp render_value(value) when is_binary(value) do
    if value != "" and Regex.match?(@safe_value, value) do
      value
    else
      escaped =
        value
        |> String.replace("\\", "\\\\")
        |> String.replace("\"", "\\\"")

      "\"" <> escaped <> "\""
    end
  end
end
