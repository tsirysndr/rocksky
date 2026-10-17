# frozen_string_literal: true

module Rocksky
  # app.rocksky.event.* — indexed music events (community.lexicon.calendar.event
  # records annotated by app.rocksky.event.music) and their RSVPs.
  module Event
    module_function

    # Indexed music events, soonest first. Without a time window only unexpired
    # events are returned; +include_past+ lists past events, most recent first.
    # Filters: +artist+ (AT-URI, id or sha256), +did+ (publisher), +rsvp_by+
    # (a DID that RSVP'd going/interested), +kind+, +genre+, +from+ / +to+
    # (RFC-3339). Pass +token+ to get each event's "viewerRsvp". Returns
    # { "events" => [...] }.
    def events(artist: nil, did: nil, rsvp_by: nil, kind: nil, genre: nil, from: nil, to: nil,
               include_past: false, limit: nil, offset: nil, token: nil, base: nil)
      params = { artist: artist, did: did, rsvpBy: rsvp_by, kind: kind, genre: genre,
                 from: from, to: to, limit: limit, offset: offset }.compact
      params[:includePast] = true if include_past
      Rocksky.get("app.rocksky.event.getEvents", params, base: base, token: token)
    end

    # One music event by the AT-URI of either its calendar event record or its
    # app.rocksky.event.music record.
    def event(uri, token: nil, base: nil)
      Rocksky.get("app.rocksky.event.getEvent", { uri: uri }, base: base, token: token)
    end

    # Who responded to an event, most recent first ({ "rsvps" => [...] }).
    # +status+ narrows to one community.lexicon.calendar.rsvp#… token.
    def rsvps(uri, status: nil, limit: nil, offset: nil, base: nil)
      params = { uri: uri, status: status, limit: limit, offset: offset }.compact
      Rocksky.get("app.rocksky.event.getEventRsvps", params, base: base)
    end

    # The music events an artist is billed on, soonest first
    # ({ "events" => [...] }); +include_past+ adds past events, most recent first.
    def artist_events(uri, include_past: false, limit: nil, offset: nil, base: nil)
      params = { uri: uri, limit: limit, offset: offset }.compact
      params[:includePast] = true if include_past
      Rocksky.get("app.rocksky.artist.getArtistEvents", params, base: base)
    end

    # Set the viewer's RSVP on an event. +status+ is a
    # community.lexicon.calendar.rsvp#{going,interested,notgoing} token; an
    # existing RSVP record is reused. Returns { "uri" => ..., "status" => ... }.
    def put_rsvp(uri, status, token:, base: nil)
      # putRsvp's input is a JSON body, so it rides the body-carrying native
      # call rather than the query-string Rocksky.post.
      Rocksky.unwrap(C.rocksky_library_post(base.to_s, token.to_s,
                                            "app.rocksky.event.putRsvp",
                                            JSON.generate({ uri: uri, status: status })))
    end
  end
end
