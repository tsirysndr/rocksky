module Rocksky
  module Resources
    # `app.rocksky.album.*` endpoints.
    class Album < Base
      # Fetch an album by AT-URI.
      def get_album(uri:)
        query("app.rocksky.album.getAlbum", uri: uri)
      end

      # List albums.
      def get_albums(limit: nil, offset: nil, genre: nil)
        query("app.rocksky.album.getAlbums",
              limit: limit, offset: offset, genre: genre)
      end

      # Tracks belonging to an album.
      def get_album_tracks(uri:)
        query("app.rocksky.album.getAlbumTracks", uri: uri)
      end
    end
  end
end
