module Rocksky
  module Resources
    # `app.rocksky.stats.*` endpoints.
    class Stats < Base
      # Per-user stats.
      def get_stats(did:)
        query("app.rocksky.stats.getStats", did: did)
      end

      # Year-in-review ("Wrapped") data.
      def get_wrapped(did:, year: nil)
        query("app.rocksky.stats.getWrapped", did: did, year: year)
      end
    end
  end
end
