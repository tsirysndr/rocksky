defmodule Rocksky.ChartsTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  test "get_top_tracks/2 maps params" do
    stub_json(:charts_top_tracks, %{"tracks" => []}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.charts.getTopTracks")
      assert conn.query_params == %{"limit" => "10", "startDate" => "2026-01-01"}
    end)

    assert {:ok, _} =
             client(:charts_top_tracks)
             |> Rocksky.Charts.get_top_tracks(limit: 10, startDate: "2026-01-01")
  end

  test "get_scrobbles_chart/2 supports `did` filter" do
    stub_json(:charts_scrobbles, %{"chart" => []}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.charts.getScrobblesChart")
      assert conn.query_params == %{"did" => "alice"}
    end)

    assert {:ok, _} =
             client(:charts_scrobbles)
             |> Rocksky.Charts.get_scrobbles_chart(did: "alice")
  end
end
