module Rocksky
  module Resources
    # `app.rocksky.rockbox.*` endpoints.
    class Rockbox < Base
      # Get Rockbox audio settings.
      # Pass `did:` to fetch any user's settings publicly (no auth needed).
      # Omit `did:` to fetch the authenticated caller's own settings (auth required).
      def get_audio_settings(did: nil)
        params = did ? { did: did } : {}
        query("app.rocksky.rockbox.getAudioSettings", **params)
      end

      # Upsert Rockbox audio settings. Only provided sections are merged.
      def put_audio_settings(crossfade: nil, equalizer: nil, replay_gain: nil, tone: nil)
        body = {
          crossfade: crossfade,
          equalizer: equalizer,
          replayGain: replay_gain,
          tone: tone,
        }.compact
        procedure("app.rocksky.rockbox.putAudioSettings", body: body)
      end
    end
  end
end
