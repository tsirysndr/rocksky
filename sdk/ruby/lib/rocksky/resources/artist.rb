module Rocksky
  module Resources
    # `app.rocksky.artist.*` endpoints.
    class Artist < Base
      # Fetch an artist by AT-URI.
      def get_artist(uri:)
        query("app.rocksky.artist.getArtist", uri: uri)
      end

      # List artists. `names` may be an Array of strings; it will be joined CSV-style.
      def get_artists(limit: nil, offset: nil, names: nil, genre: nil)
        query("app.rocksky.artist.getArtists",
              limit: limit, offset: offset, names: names, genre: genre)
      end

      # Albums by an artist.
      def get_artist_albums(uri:)
        query("app.rocksky.artist.getArtistAlbums", uri: uri)
      end

      # Tracks by an artist.
      def get_artist_tracks(uri:, limit: nil, offset: nil)
        query("app.rocksky.artist.getArtistTracks",
              uri: uri, limit: limit, offset: offset)
      end

      # All-time listeners for an artist.
      def get_artist_listeners(uri:, limit: nil, offset: nil)
        query("app.rocksky.artist.getArtistListeners",
              uri: uri, limit: limit, offset: offset)
      end

      # Recent listeners for an artist.
      def get_artist_recent_listeners(uri:, limit: nil, offset: nil)
        query("app.rocksky.artist.getArtistRecentListeners",
              uri: uri, limit: limit, offset: offset)
      end
    end
  end
end
