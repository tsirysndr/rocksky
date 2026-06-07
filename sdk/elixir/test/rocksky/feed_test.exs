defmodule Rocksky.FeedTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  test "get_stories/2 forwards size, feed and following params" do
    stub_json(:feed_stories, %{"stories" => []}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.feed.getStories")

      assert conn.query_params == %{
               "size" => "10",
               "feed" => "at://did:plc:abc/app.rocksky.feed.generator/metalcore",
               "following" => "true"
             }
    end)

    assert {:ok, _} =
             client(:feed_stories)
             |> Rocksky.Feed.get_stories(
               size: 10,
               feed: "at://did:plc:abc/app.rocksky.feed.generator/metalcore",
               following: true
             )
  end

  test "get_stories/2 with no filters" do
    stub_json(:feed_stories_recent, %{"stories" => []}, fn conn ->
      assert_path(conn, "/xrpc/app.rocksky.feed.getStories")
      assert conn.query_params == %{"size" => "5"}
    end)

    assert {:ok, _} =
             client(:feed_stories_recent)
             |> Rocksky.Feed.get_stories(size: 5)
  end
end
