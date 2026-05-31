defmodule Rocksky.Builder do
  @moduledoc """
  `use Rocksky.Builder` turns a module into a chainable, pipe-friendly request
  builder for a single XRPC procedure.

  ## Example

      defmodule Rocksky.Scrobble.Builder do
        use Rocksky.Builder,
          nsid: "app.rocksky.scrobble.createScrobble",
          required: [:title, :artist],
          optional: [:album, :duration, :mbId, :isrc, :albumArt, :timestamp]
      end

      alias Rocksky.Scrobble.Builder, as: Scrobble

      Scrobble.new(title: "In Bloom", artist: "Nirvana")
      |> Scrobble.album("Nevermind")
      |> Scrobble.timestamp(System.system_time(:second))
      |> Scrobble.submit(client)

  ## What you get

  For each field listed in `:required` or `:optional` the macro generates a
  `field/2` setter that returns the updated builder (snake-cased: a `:mbId`
  field becomes `mb_id/2`).

  In addition:

    * `new/1` — build from a keyword list / map. Returns a `%__MODULE__{}`.
    * `put/2` — generic batch setter that accepts a keyword list or map.
    * `submit/2` — issue the underlying XRPC procedure with the current builder
      as the JSON body. Returns `{:ok, body} | {:error, Rocksky.Error.t()}`.
      If any `:required` field is `nil`, returns
      `{:error, %Rocksky.Error{reason: :missing_fields, ...}}` without making
      a network call.
    * `to_body/1` — return the body that would be sent, with `nil` fields
      stripped. Useful for inspection in tests.
  """

  defmacro __using__(opts) do
    nsid = Keyword.fetch!(opts, :nsid)
    required = Keyword.get(opts, :required, [])
    optional = Keyword.get(opts, :optional, [])
    fields = required ++ optional

    if fields == [] do
      raise ArgumentError, "Rocksky.Builder requires at least one :required or :optional field"
    end

    # snake_case → original camelCase atom (and identity for already-camel keys).
    # Lets new/1 and put/2 accept either form.
    field_aliases =
      for field <- fields, reduce: %{} do
        acc ->
          snake = field |> Atom.to_string() |> Macro.underscore() |> String.to_atom()
          acc |> Map.put(field, field) |> Map.put(snake, field)
      end

    setters =
      for field <- fields do
        snake = field |> Atom.to_string() |> Macro.underscore() |> String.to_atom()

        quote do
          @doc "Set `#{unquote(field)}` on the builder."
          def unquote(snake)(%__MODULE__{} = builder, value) do
            Map.put(builder, unquote(field), value)
          end
        end
      end

    quote do
      @rocksky_nsid unquote(nsid)
      @rocksky_required unquote(required)
      @rocksky_field_aliases unquote(Macro.escape(field_aliases))

      defstruct unquote(fields)

      @type t :: %__MODULE__{}

      @doc """
      Build a new request from a keyword list or map of fields.

      Accepts either the canonical lexicon key (`:mbId`) or its snake-cased
      equivalent (`:mb_id`). Unknown keys raise.
      """
      @spec new(keyword() | map()) :: t()
      def new(attrs \\ []) do
        struct!(__MODULE__, normalize_keys(attrs))
      end

      @doc """
      Batch-set fields. `attrs` is a keyword list or map. Accepts the same
      key forms as `new/1`.
      """
      @spec put(t(), keyword() | map()) :: t()
      def put(%__MODULE__{} = builder, attrs) when is_list(attrs) or is_map(attrs) do
        struct!(builder, normalize_keys(attrs))
      end

      defp normalize_keys(attrs) do
        Map.new(attrs, fn {k, v} ->
          {Map.get(@rocksky_field_aliases, k, k), v}
        end)
      end

      @doc "Return the JSON body that would be sent (nil fields stripped)."
      @spec to_body(t()) :: map()
      def to_body(%__MODULE__{} = builder) do
        builder
        |> Map.from_struct()
        |> Enum.reject(fn {_k, v} -> is_nil(v) end)
        |> Map.new()
      end

      @doc """
      Submit the builder. Returns `{:ok, body}` on success or
      `{:error, %Rocksky.Error{}}` on failure.

      Returns `{:error, %Rocksky.Error{reason: :missing_fields}}` without
      making a network call when any required field is `nil`.
      """
      @spec submit(t(), Rocksky.Client.t()) ::
              {:ok, term()} | {:error, Rocksky.Error.t()}
      def submit(%__MODULE__{} = builder, %Rocksky.Client{} = client) do
        case missing_required(builder) do
          [] ->
            Rocksky.HTTP.procedure(client, @rocksky_nsid, [], to_body(builder))

          missing ->
            {:error,
             %Rocksky.Error{
               status: nil,
               reason: :missing_fields,
               message:
                 "missing required field(s): " <>
                   Enum.map_join(missing, ", ", &Atom.to_string/1),
               body: %{missing: missing}
             }}
        end
      end

      defp missing_required(%__MODULE__{} = builder) do
        Enum.filter(@rocksky_required, fn field -> is_nil(Map.fetch!(builder, field)) end)
      end

      unquote(setters)
    end
  end
end
