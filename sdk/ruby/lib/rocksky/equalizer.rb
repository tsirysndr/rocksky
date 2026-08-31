# frozen_string_literal: true

module Rocksky
  # app.rocksky.equalizer.* — saved EQ presets (app.rocksky.equalizer records
  # in the caller's repo).
  #
  # Units are rockbox's internal ones: band frequency in Hz, gain in tenths of
  # dB (30 = +3.0 dB), q × 10 (7 = Q 0.7); precut in tenths of dB (-240..0).
  module Equalizer
    module_function

    # An actor's presets ({ "presets" => [...] }). Omit +actor+ for the
    # authenticated viewer's own — that read is auth-gated, so pass +token+.
    def presets(actor: nil, token: nil, base: nil)
      params = {}
      params[:did] = actor if actor
      Rocksky.get("app.rocksky.equalizer.listPresets", params, base: base, token: token)
    end

    # Create or update a preset; the rkey is +name+ slugified, so an existing
    # name overwrites that preset. +bands+ is an array of
    # { frequency:, gain:, q: } hashes. Returns the saved preset view.
    def put_preset(name, bands, token:, precut: nil, base: nil)
      body = { name: name, bands: bands }
      body[:precut] = precut if precut
      # putPreset's input is a JSON body, so it rides the body-carrying native
      # call rather than the query-string Rocksky.post.
      Rocksky.unwrap(C.rocksky_library_post(base.to_s, token.to_s,
                                            "app.rocksky.equalizer.putPreset",
                                            JSON.generate(body)))
    end

    # Delete a preset by rkey. Empty response.
    def delete_preset(rkey, token:, base: nil)
      Rocksky.post("app.rocksky.equalizer.deletePreset", { rkey: rkey }, base: base, token: token)
    end
  end
end
