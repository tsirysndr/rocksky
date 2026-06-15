require "rocksky/version"
require "rocksky/error"
require "rocksky/http"
require "rocksky/resources/base"
require "rocksky/resources/actor"
require "rocksky/resources/album"
require "rocksky/resources/apikey"
require "rocksky/resources/artist"
require "rocksky/resources/charts"
require "rocksky/resources/feed"
require "rocksky/resources/graph"
require "rocksky/resources/like"
require "rocksky/resources/mirror"
require "rocksky/resources/player"
require "rocksky/resources/rockbox"
require "rocksky/resources/playlist"
require "rocksky/resources/scrobble"
require "rocksky/resources/shout"
require "rocksky/resources/song"
require "rocksky/resources/spotify"
require "rocksky/resources/stats"
require "rocksky/client"
require "rocksky/generated/types"

module Rocksky
  # Build a new Rocksky client.
  #
  #   client = Rocksky.new(token: ENV["ROCKSKY_TOKEN"])
  #
  # See {Rocksky::Client#initialize} for all options.
  def self.new(**opts)
    Client.new(**opts)
  end
end
