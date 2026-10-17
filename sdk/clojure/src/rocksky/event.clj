(ns rocksky.event
  "app.rocksky.event.* — indexed music events (community.lexicon.calendar.event
  records annotated by app.rocksky.event.music) and their RSVPs."
  (:require [rocksky.core :as core]))

(defn- prune [m] (into {} (remove (comp nil? val) m)))

;; app.rocksky.event.getEvents — {"events" [...]}, soonest first. Without a time
;; window only unexpired events come back; :include-past lists past events,
;; most recent first. Filters: :artist (AT-URI, id or sha256), :did (publisher),
;; :rsvp-by (a DID that RSVP'd going/interested), :kind, :genre, :from / :to
;; (RFC-3339). Pass :token to get each event's "viewerRsvp".
(defn events
  ([] (events {}))
  ([{:keys [artist did rsvp-by kind genre from to include-past limit offset token base]}]
   (core/query "app.rocksky.event.getEvents"
               (prune {:artist artist :did did :rsvpBy rsvp-by :kind kind :genre genre
                       :from from :to to :includePast (when include-past true)
                       :limit limit :offset offset})
               base token)))

;; app.rocksky.event.getEvent — one event by the AT-URI of its calendar event
;; or its app.rocksky.event.music record.
(defn event
  ([uri] (event uri {}))
  ([uri {:keys [token base]}]
   (core/query "app.rocksky.event.getEvent" {:uri uri} base token)))

;; app.rocksky.event.getEventRsvps — {"rsvps" [...]}, most recent first.
;; :status narrows to one community.lexicon.calendar.rsvp#… token.
(defn rsvps
  ([uri] (rsvps uri {}))
  ([uri {:keys [status limit offset base]}]
   (core/query "app.rocksky.event.getEventRsvps"
               (prune {:uri uri :status status :limit limit :offset offset})
               base)))

;; app.rocksky.artist.getArtistEvents — {"events" [...]} an artist is billed
;; on, soonest first; :include-past adds past events, most recent first.
(defn artist-events
  ([uri] (artist-events uri {}))
  ([uri {:keys [include-past limit offset base]}]
   (core/query "app.rocksky.artist.getArtistEvents"
               (prune {:uri uri :includePast (when include-past true)
                       :limit limit :offset offset})
               base)))

;; app.rocksky.event.putRsvp — set the viewer's RSVP; `status` is a
;; community.lexicon.calendar.rsvp#{going,interested,notgoing} token and an
;; existing RSVP record is reused. Its input is a JSON body, so it rides the
;; body-carrying library-post rather than the query-string core/procedure.
(defn put-rsvp
  [uri status {:keys [token base]}]
  (core/library-post token "app.rocksky.event.putRsvp" {:uri uri :status status} base))
