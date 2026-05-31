module Rocksky
  module Resources
    # `app.rocksky.song.*` endpoints.
    class Song < Base
      # Fetch a song by URI, MusicBrainz id, ISRC, or Spotify id.
      def get_song(uri: nil, mbid: nil, isrc: nil, spotify_id: nil)
        query("app.rocksky.song.getSong",
              uri: uri, mbid: mbid, isrc: isrc, spotifyId: spotify_id)
      end

      # List songs.
      def get_songs(limit: nil, offset: nil, genre: nil,
                    mbid: nil, isrc: nil, spotify_id: nil)
        query("app.rocksky.song.getSongs",
              limit: limit, offset: offset, genre: genre,
              mbid: mbid, isrc: isrc, spotifyId: spotify_id)
      end

      # Recent listeners for a song.
      def get_song_recent_listeners(uri:, limit: nil, offset: nil)
        query("app.rocksky.song.getSongRecentListeners",
              uri: uri, limit: limit, offset: offset)
      end

      # Find an existing song by metadata.
      def match_song(title:, artist:, mb_id: nil, isrc: nil)
        query("app.rocksky.song.matchSong",
              title: title, artist: artist, mbId: mb_id, isrc: isrc)
      end

      # Create a song.
      def create_song(title:, artist:, **extra)
        body = { title: title, artist: artist }.merge(extra).compact
        procedure("app.rocksky.song.createSong", body: body)
      end
    end
  end
end
