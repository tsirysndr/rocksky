module Rocksky
  module Resources
    # `app.rocksky.feed.*` endpoints.
    class Feed < Base
      # Free-text search across the catalogue.
      # `q` accepts a positional or `query:` keyword; both map to the lexicon's
      # `query` parameter.
      def search(q = nil, query: nil)
        term = q || query
        raise ArgumentError, "search needs a query string" if term.nil? || term.empty?

        @http.query("app.rocksky.feed.search", query: term)
      end

      # List feed generators.
      def get_feed_generators(size: nil)
        query("app.rocksky.feed.getFeedGenerators", size: size)
      end

      # Fetch a feed generator by URI.
      def get_feed_generator(feed:)
        query("app.rocksky.feed.getFeedGenerator", feed: feed)
      end

      # Fetch feed contents.
      def get_feed(feed:, limit: nil, cursor: nil)
        query("app.rocksky.feed.getFeed", feed: feed, limit: limit, cursor: cursor)
      end

      # Stories (recent highlights).
      def get_stories(size: nil)
        query("app.rocksky.feed.getStories", size: size)
      end

      # Track recommendations for an actor.
      def get_recommendations(did:, limit: nil)
        query("app.rocksky.feed.getRecommendations", did: did, limit: limit)
      end

      # Artist recommendations for an actor.
      def get_artist_recommendations(did:, limit: nil)
        query("app.rocksky.feed.getArtistRecommendations", did: did, limit: limit)
      end

      # Album recommendations for an actor.
      def get_album_recommendations(did:, limit: nil)
        query("app.rocksky.feed.getAlbumRecommendations", did: did, limit: limit)
      end
    end
  end
end
