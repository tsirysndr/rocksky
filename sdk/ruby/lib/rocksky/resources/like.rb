module Rocksky
  module Resources
    # `app.rocksky.like.*` endpoints. All require an authenticated client.
    class Like < Base
      # Like a song.
      def like_song(uri:)
        procedure("app.rocksky.like.likeSong", body: { uri: uri })
      end

      # Remove a like on a song.
      def dislike_song(uri:)
        procedure("app.rocksky.like.dislikeSong", body: { uri: uri })
      end

      # Like a shout.
      def like_shout(uri:)
        procedure("app.rocksky.like.likeShout", body: { uri: uri })
      end

      # Remove a like on a shout.
      def dislike_shout(uri:)
        procedure("app.rocksky.like.dislikeShout", body: { uri: uri })
      end
    end
  end
end
