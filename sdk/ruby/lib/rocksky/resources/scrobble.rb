module Rocksky
  module Resources
    # `app.rocksky.scrobble.*` endpoints.
    class Scrobble < Base
      # Create a new scrobble. Requires an authenticated client.
      #
      # Required: `title`, `artist`. Everything else is optional metadata that
      # gets forwarded as-is to the lexicon's createScrobble body. Extra fields
      # may be passed via `**extra`.
      #
      # Example:
      #
      #   client.scrobble.create_scrobble(
      #     title: "In Bloom",
      #     artist: "Nirvana",
      #     album: "Nevermind",
      #     timestamp: Time.now.to_i
      #   )
      def create_scrobble(title:, artist:, **extra)
        body = { title: title, artist: artist }.merge(extra).compact
        procedure("app.rocksky.scrobble.createScrobble", body: body)
      end

      # Fetch a scrobble by URI.
      def get_scrobble(uri:)
        query("app.rocksky.scrobble.getScrobble", uri: uri)
      end

      # List scrobbles.
      def get_scrobbles(did: nil, following: nil, limit: nil, offset: nil)
        query("app.rocksky.scrobble.getScrobbles",
              did: did, following: following, limit: limit, offset: offset)
      end
    end
  end
end
