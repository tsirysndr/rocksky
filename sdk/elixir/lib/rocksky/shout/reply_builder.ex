defmodule Rocksky.Shout.ReplyBuilder do
  @moduledoc """
  Builder for `app.rocksky.shout.replyShout`.

  ## Example

      alias Rocksky.Shout.ReplyBuilder, as: Reply

      Reply.new(shout_id: "shout-123", message: "great track!")
      |> Reply.submit(client)
  """

  use Rocksky.Builder,
    nsid: "app.rocksky.shout.replyShout",
    required: [:shoutId, :message]
end
