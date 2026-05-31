module Rocksky
  module Resources
    # `app.rocksky.graph.*` endpoints.
    class Graph < Base
      # Follow an account. `account` is a DID or handle.
      def follow_account(account:)
        procedure("app.rocksky.graph.followAccount", params: { account: account })
      end

      # Unfollow an account.
      def unfollow_account(account:)
        procedure("app.rocksky.graph.unfollowAccount", params: { account: account })
      end

      # Followers of an actor. `dids` may be a list; it will be CSV-encoded.
      def get_followers(actor:, limit: nil, dids: nil, cursor: nil)
        query("app.rocksky.graph.getFollowers",
              actor: actor, limit: limit, dids: dids, cursor: cursor)
      end

      # Accounts an actor follows.
      def get_follows(actor:, limit: nil, dids: nil, cursor: nil)
        query("app.rocksky.graph.getFollows",
              actor: actor, limit: limit, dids: dids, cursor: cursor)
      end

      # Followers of an actor that the viewer also knows.
      def get_known_followers(actor:, limit: nil, cursor: nil)
        query("app.rocksky.graph.getKnownFollowers",
              actor: actor, limit: limit, cursor: cursor)
      end
    end
  end
end
