defmodule Rocksky.Shout.ReportBuilder do
  @moduledoc """
  Builder for `app.rocksky.shout.reportShout`.

  ## Example

      alias Rocksky.Shout.ReportBuilder, as: Report

      Report.new(shout_id: "shout-123", reason: "spam")
      |> Report.submit(client)
  """

  use Rocksky.Builder,
    nsid: "app.rocksky.shout.reportShout",
    required: [:shoutId, :reason]
end
