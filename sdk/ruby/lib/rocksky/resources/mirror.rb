module Rocksky
  module Resources
    # `app.rocksky.mirror.*` endpoints. Require an authenticated client.
    class Mirror < Base
      # List configured mirror sources for the authenticated user.
      def get_mirror_sources
        query("app.rocksky.mirror.getMirrorSources")
      end

      # Configure a mirror source (e.g. Last.fm, ListenBrainz).
      def put_mirror_source(provider:, enabled: nil, external_username: nil, api_key: nil)
        body = {
          provider: provider,
          enabled: enabled,
          externalUsername: external_username,
          apiKey: api_key
        }.compact
        procedure("app.rocksky.mirror.putMirrorSource", body: body)
      end
    end
  end
end
