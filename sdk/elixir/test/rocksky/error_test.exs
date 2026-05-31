defmodule Rocksky.ErrorTest do
  use ExUnit.Case, async: true

  alias Rocksky.Error

  test "extracts message from `message` key" do
    err = Error.from_status(404, %{"message" => "not found"})
    assert err.status == 404
    assert err.reason == :not_found
    assert err.message == "not found"
  end

  test "falls back to `error` key" do
    err = Error.from_status(400, %{"error" => "bad"})
    assert err.message == "bad"
  end

  test "wraps string bodies" do
    err = Error.from_status(500, "internal")
    assert err.message == "internal"
    assert err.reason == :server_error
  end

  test "Exception protocol formats with status" do
    msg = Exception.message(Error.from_status(429, %{"message" => "slow down"}))
    assert msg == "(HTTP 429) slow down"
  end

  test "transport error preserves reason" do
    err = Error.from_transport(:timeout)
    assert err.status == nil
    assert err.reason == :transport_error
    assert err.message =~ ":timeout"
  end
end
