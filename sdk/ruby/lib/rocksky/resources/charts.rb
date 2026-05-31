module Rocksky
  module Resources
    # `app.rocksky.charts.*` endpoints.
    class Charts < Base
      # Scrobble chart data.
      def get_scrobbles_chart(did: nil, artist_uri: nil, album_uri: nil,
                              song_uri: nil, genre: nil, from: nil, to: nil)
        query("app.rocksky.charts.getScrobblesChart",
              did: did,
              artisturi: artist_uri,
              albumuri: album_uri,
              songuri: song_uri,
              genre: genre,
              from: from,
              to: to)
      end

      # Top artists.
      def get_top_artists(limit: nil, offset: nil, start_date: nil, end_date: nil)
        query("app.rocksky.charts.getTopArtists",
              limit: limit, offset: offset,
              startDate: start_date, endDate: end_date)
      end

      # Top tracks.
      def get_top_tracks(limit: nil, offset: nil, start_date: nil, end_date: nil)
        query("app.rocksky.charts.getTopTracks",
              limit: limit, offset: offset,
              startDate: start_date, endDate: end_date)
      end
    end
  end
end
