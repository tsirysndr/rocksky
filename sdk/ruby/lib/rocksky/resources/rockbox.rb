module Rocksky
  module Resources
    # `app.rocksky.rockbox.*` endpoints. Require an authenticated client.
    class Rockbox < Base
      # Get the authenticated user's Rockbox audio settings.
      def get_audio_settings
        query("app.rocksky.rockbox.getAudioSettings")
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
