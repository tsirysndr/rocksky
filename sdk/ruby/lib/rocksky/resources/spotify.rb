module Rocksky
  module Resources
    # `app.rocksky.spotify.*` endpoints — Spotify remote control for the
    # authenticated user.
    class Spotify < Base
      # Currently playing on Spotify.
      def get_currently_playing(actor: nil)
        query("app.rocksky.spotify.getCurrentlyPlaying", actor: actor)
      end

      # Resume Spotify playback.
      def play
        procedure("app.rocksky.spotify.play")
      end

      # Pause Spotify playback.
      def pause
        procedure("app.rocksky.spotify.pause")
      end

      # Skip to next track.
      def next
        procedure("app.rocksky.spotify.next")
      end

      # Go to previous track.
      def previous
        procedure("app.rocksky.spotify.previous")
      end

      # Seek to position in milliseconds.
      def seek(position:)
        procedure("app.rocksky.spotify.seek", params: { position: position })
      end
    end
  end
end
