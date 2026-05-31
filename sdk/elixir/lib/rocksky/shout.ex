defmodule Rocksky.Shout do
  @moduledoc "`app.rocksky.shout.*` endpoints."

  alias Rocksky.HTTP

  @doc "Create a shout. Body: `:message`."
  def create_shout(client, body),
    do: HTTP.procedure(client, "app.rocksky.shout.createShout", [], Map.new(body))

  @doc "Reply to a shout. Body: `:shoutId`, `:message`."
  def reply_shout(client, body),
    do: HTTP.procedure(client, "app.rocksky.shout.replyShout", [], Map.new(body))

  @doc "Remove a shout. Params: `:id`."
  def remove_shout(client, params),
    do: HTTP.procedure(client, "app.rocksky.shout.removeShout", params)

  @doc "Report a shout. Body: `:shoutId`, `:reason`."
  def report_shout(client, body),
    do: HTTP.procedure(client, "app.rocksky.shout.reportShout", [], Map.new(body))

  @doc "Shouts on a profile. Params: `:did`, `:limit`, `:offset`."
  def get_profile_shouts(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.shout.getProfileShouts", params)

  @doc "Shouts on an album. Params: `:uri`, `:limit`, `:offset`."
  def get_album_shouts(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.shout.getAlbumShouts", params)

  @doc "Shouts on an artist. Params: `:uri`, `:limit`, `:offset`."
  def get_artist_shouts(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.shout.getArtistShouts", params)

  @doc "Shouts on a track. Params: `:uri`."
  def get_track_shouts(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.shout.getTrackShouts", params)

  @doc "Replies to a shout. Params: `:uri`, `:limit`, `:offset`."
  def get_shout_replies(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.shout.getShoutReplies", params)
end
