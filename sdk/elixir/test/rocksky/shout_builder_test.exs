defmodule Rocksky.Shout.BuilderTest do
  use ExUnit.Case, async: true

  import Rocksky.Test.ReqHelpers

  alias Rocksky.Error
  alias Rocksky.Shout.{ReplyBuilder, ReportBuilder}

  describe "ReplyBuilder" do
    test "POSTs to replyShout with snake_case constructor" do
      stub_json(:shout_reply, %{}, fn conn ->
        assert_path(conn, "/xrpc/app.rocksky.shout.replyShout")
        assert read_json_body(conn) == %{"shoutId" => "s-1", "message" => "nice"}
      end)

      assert {:ok, %{}} =
               ReplyBuilder.new(shout_id: "s-1", message: "nice")
               |> ReplyBuilder.submit(client(:shout_reply, token: "tok"))
    end

    test "shout_id setter writes shoutId" do
      builder =
        ReplyBuilder.new()
        |> ReplyBuilder.shout_id("s-2")
        |> ReplyBuilder.message("ok")

      assert builder.shoutId == "s-2"
      assert builder.message == "ok"
    end

    test "missing required fields surface up front" do
      assert {:error, %Error{reason: :missing_fields, body: %{missing: missing}}} =
               ReplyBuilder.new() |> ReplyBuilder.submit(client(:shout_reply_missing))

      assert :shoutId in missing
      assert :message in missing
    end
  end

  describe "ReportBuilder" do
    test "POSTs to reportShout" do
      stub_json(:shout_report, %{}, fn conn ->
        assert_path(conn, "/xrpc/app.rocksky.shout.reportShout")
        assert read_json_body(conn) == %{"shoutId" => "s-1", "reason" => "spam"}
      end)

      assert {:ok, %{}} =
               ReportBuilder.new(shout_id: "s-1", reason: "spam")
               |> ReportBuilder.submit(client(:shout_report, token: "tok"))
    end
  end
end
