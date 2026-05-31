module Rocksky
  module Resources
    # `app.rocksky.shout.*` endpoints.
    class Shout < Base
      # Create a shout.
      def create_shout(message:, **extra)
        body = { message: message }.merge(extra).compact
        procedure("app.rocksky.shout.createShout", body: body)
      end

      # Reply to a shout.
      def reply_shout(shout_id:, message:)
        procedure("app.rocksky.shout.replyShout",
                  body: { shoutId: shout_id, message: message })
      end

      # Remove a shout.
      def remove_shout(id:)
        procedure("app.rocksky.shout.removeShout", params: { id: id })
      end

      # Report a shout.
      def report_shout(shout_id:, reason:)
        procedure("app.rocksky.shout.reportShout",
                  body: { shoutId: shout_id, reason: reason })
      end

      # Shouts on a profile.
      def get_profile_shouts(did:, limit: nil, offset: nil)
        query("app.rocksky.shout.getProfileShouts",
              did: did, limit: limit, offset: offset)
      end

      # Shouts on an album.
      def get_album_shouts(uri:, limit: nil, offset: nil)
        query("app.rocksky.shout.getAlbumShouts",
              uri: uri, limit: limit, offset: offset)
      end

      # Shouts on an artist.
      def get_artist_shouts(uri:, limit: nil, offset: nil)
        query("app.rocksky.shout.getArtistShouts",
              uri: uri, limit: limit, offset: offset)
      end

      # Shouts on a track.
      def get_track_shouts(uri:)
        query("app.rocksky.shout.getTrackShouts", uri: uri)
      end

      # Replies to a shout.
      def get_shout_replies(uri:, limit: nil, offset: nil)
        query("app.rocksky.shout.getShoutReplies",
              uri: uri, limit: limit, offset: offset)
      end
    end
  end
end
