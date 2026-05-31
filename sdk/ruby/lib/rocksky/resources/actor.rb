module Rocksky
  module Resources
    # `app.rocksky.actor.*` endpoints.
    class Actor < Base
      # Fetch a profile by DID or handle.
      def get_profile(did:)
        query("app.rocksky.actor.getProfile", did: did)
      end

      # Albums an actor has scrobbled.
      def get_actor_albums(did:, limit: nil, offset: nil, start_date: nil, end_date: nil)
        query("app.rocksky.actor.getActorAlbums",
              did: did, limit: limit, offset: offset,
              startDate: start_date, endDate: end_date)
      end

      # Artists an actor has scrobbled.
      def get_actor_artists(did:, limit: nil, offset: nil, start_date: nil, end_date: nil)
        query("app.rocksky.actor.getActorArtists",
              did: did, limit: limit, offset: offset,
              startDate: start_date, endDate: end_date)
      end

      # Songs an actor has scrobbled.
      def get_actor_songs(did:, limit: nil, offset: nil, start_date: nil, end_date: nil)
        query("app.rocksky.actor.getActorSongs",
              did: did, limit: limit, offset: offset,
              startDate: start_date, endDate: end_date)
      end

      # Songs an actor has loved.
      def get_actor_loved_songs(did:, limit: nil, offset: nil)
        query("app.rocksky.actor.getActorLovedSongs",
              did: did, limit: limit, offset: offset)
      end

      # Scrobbles for an actor.
      def get_actor_scrobbles(did:, limit: nil, offset: nil)
        query("app.rocksky.actor.getActorScrobbles",
              did: did, limit: limit, offset: offset)
      end

      # Playlists for an actor.
      def get_actor_playlists(did:, limit: nil, offset: nil)
        query("app.rocksky.actor.getActorPlaylists",
              did: did, limit: limit, offset: offset)
      end

      # Musical neighbours of an actor.
      def get_actor_neighbours(did:)
        query("app.rocksky.actor.getActorNeighbours", did: did)
      end

      # Compatibility score between the authenticated user and another actor.
      def get_actor_compatibility(did:)
        query("app.rocksky.actor.getActorCompatibility", did: did)
      end
    end
  end
end
