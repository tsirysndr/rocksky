defmodule Rocksky.Test.ReqHelpers do
  @moduledoc """
  Helpers for stubbing Req requests in tests via `Req.Test`.

  All tests build a `Rocksky.Client` whose `req_options` route requests through
  a `Req.Test` plug that we control. That lets us assert on the outgoing
  request (URL, method, headers, body, query string) and return canned JSON.
  """

  import ExUnit.Assertions

  @doc """
  Build a client wired up to a `Req.Test` stub keyed by `name`.
  """
  def client(name, opts \\ []) do
    Rocksky.new(
      Keyword.merge(
        [
          base_url: "https://api.test.rocksky.app",
          req_options: [plug: {Req.Test, name}]
        ],
        opts
      )
    )
  end

  @doc """
  Register a stub on `name` that responds with `json_body` (defaults to
  `%{}`) and lets the caller assert on the inbound `Plug.Conn`.
  """
  def stub_json(name, json_body \\ %{}, fun \\ fn _conn -> :ok end) do
    Req.Test.stub(name, fn conn ->
      conn = Plug.Conn.fetch_query_params(conn)
      fun.(conn)
      Req.Test.json(conn, json_body)
    end)
  end

  @doc "Stub that returns `status` with an empty JSON body."
  def stub_status(name, status, body \\ %{}) do
    Req.Test.stub(name, fn conn ->
      conn
      |> Plug.Conn.put_resp_content_type("application/json")
      |> Plug.Conn.send_resp(status, Jason.encode!(body))
    end)
  end

  @doc "Decode a JSON body from a conn."
  def read_json_body(conn) do
    {:ok, body, _conn} = Plug.Conn.read_body(conn)
    if body == "", do: nil, else: Jason.decode!(body)
  end

  def assert_path(conn, expected) do
    assert conn.request_path == expected
  end

  def assert_method(conn, expected) do
    assert conn.method == expected
  end
end
