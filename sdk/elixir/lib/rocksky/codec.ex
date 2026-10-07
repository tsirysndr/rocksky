defmodule Rocksky.Codec do
  @moduledoc "Runtime validation for generated XRPC structs. Unknown fields are ignored."
  @type json_value ::
          nil
          | boolean()
          | integer()
          | float()
          | String.t()
          | [json_value()]
          | %{String.t() => json_value()}
  # Erlang/OTP JSON uses the atom :null; Elixir models use nil.
  def from_wire(:null), do: nil
  def from_wire(v) when is_list(v), do: Enum.map(v, &from_wire/1)
  def from_wire(v) when is_map(v), do: Map.new(v, fn {k, x} -> {k, from_wire(x)} end)
  def from_wire(v), do: v
  def to_wire(nil), do: :null
  def to_wire(v) when is_list(v), do: Enum.map(v, &to_wire/1)
  def to_wire(v) when is_map(v), do: Map.new(v, fn {k, x} -> {k, to_wire(x)} end)
  def to_wire(v), do: v

  def decode(module, value) do
    try do
      {:ok, decode_value({:record, module}, value)}
    rescue
      error in ArgumentError -> {:error, {:decode, error.message}}
    end
  end

  def decode_value({:record, module}, value) when is_map(value) do
    fields =
      Enum.map(module.__schema__(), fn {wire, field, required, nullable, type} ->
        decoded =
          case Map.fetch(value, wire) do
            :error when not required -> nil
            {:ok, nil} when not required or nullable -> nil
            {:ok, v} -> decode_value(type, v)
            :error -> raise ArgumentError, "Missing required field: #{wire}"
          end

        {field, decoded}
      end)

    struct!(module, fields)
  end

  def decode_value(:string, v) when is_binary(v), do: v
  def decode_value(:binary, v) when is_binary(v), do: v
  def decode_value(:integer, v) when is_integer(v), do: v
  def decode_value(:float, v) when is_number(v), do: v / 1
  def decode_value(:boolean, v) when is_boolean(v), do: v
  def decode_value({:list, type}, v) when is_list(v), do: Enum.map(v, &decode_value(type, &1))

  def decode_value(:json_value, v)
      when is_nil(v) or is_boolean(v) or is_number(v) or is_binary(v), do: v

  def decode_value(:json_value, v) when is_list(v),
    do: Enum.map(v, &decode_value(:json_value, &1))

  def decode_value(:json_value, v) when is_map(v),
    do: Map.new(v, fn {k, x} -> {decode_value(:string, k), decode_value(:json_value, x)} end)

  def decode_value(type, _), do: raise(ArgumentError, "Invalid value for #{inspect(type)}")

  def encode(module, %{__struct__: module} = value) do
    module.__schema__()
    |> Enum.flat_map(fn {wire, field, required, nullable, type} ->
      case Map.fetch!(value, field) do
        nil when not required -> []
        nil when nullable -> [{wire, nil}]
        nil -> raise ArgumentError, "Missing required field: #{wire}"
        v -> [{wire, encode_value(type, v)}]
      end
    end)
    |> Map.new()
  end

  def encode(module, _), do: raise(ArgumentError, "Expected #{inspect(module)} struct")
  defp encode_value({:record, module}, v), do: encode(module, v)
  defp encode_value({:list, type}, v) when is_list(v), do: Enum.map(v, &encode_value(type, &1))
  defp encode_value(type, v), do: decode_value(type, v)
end
