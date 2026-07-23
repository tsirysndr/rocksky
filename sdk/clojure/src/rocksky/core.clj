(ns rocksky.core
  "Native core bindings for Rocksky.

  JVM Panama (java.lang.foreign) bindings to the shared Rust core's C ABI
  (crates/rocksky-uniffi). AT Protocol PDS writes (scrobble fan-out, like,
  follow, shout), AppView reads, and the identity hashes shared across every
  Rocksky SDK. This is the write + dedup side; `rocksky.client` is the read/HTTP
  side. Requires JDK 22+ (run with --enable-native-access=ALL-UNNAMED)."
  (:require [cheshire.core :as json]
            [rocksky.native :as native])
  (:import [java.lang.foreign Arena Linker FunctionDescriptor SymbolLookup
            ValueLayout MemoryLayout MemorySegment Linker$Option]
           [java.lang.invoke MethodHandle]))

;; Native resolution is deferred behind delays so merely requiring this namespace
;; touches no native code; the library is resolved on the first actual call.
(def ^:private lib-path (delay (native/resolve-lib)))
(def ^:private arena  (delay (Arena/ofShared)))
(def ^:private linker (delay (Linker/nativeLinker)))
(def ^:private lookup (delay (SymbolLookup/libraryLookup @lib-path ^Arena @arena)))

(def ^:private ADDR ValueLayout/ADDRESS)
(def ^:private I32 ValueLayout/JAVA_INT)
(def ^:private I64 ValueLayout/JAVA_LONG)

(defn- ^MethodHandle downcall
  "Bind a C function `name` to a MethodHandle. `ret` is nil for void."
  [name ret arg-layouts]
  (let [seg (.orElseThrow (.find ^SymbolLookup @lookup name))
        arr (into-array MemoryLayout arg-layouts)
        fd  (if ret
              (FunctionDescriptor/of ret arr)
              (FunctionDescriptor/ofVoid arr))]
    (.downcallHandle ^Linker @linker seg fd (make-array Linker$Option 0))))

(def ^:private h-profile  (delay (downcall "rocksky_profile" ADDR [ADDR ADDR])))
(def ^:private h-scrobbles (delay (downcall "rocksky_scrobbles" ADDR [ADDR ADDR I32 I32])))
(def ^:private h-toptracks (delay (downcall "rocksky_top_tracks" ADDR [ADDR I32 I32])))
(def ^:private h-stats    (delay (downcall "rocksky_global_stats" ADDR [ADDR])))
(def ^:private h-get      (delay (downcall "rocksky_get" ADDR [ADDR ADDR ADDR ADDR])))
(def ^:private h-match    (delay (downcall "rocksky_match_song" ADDR [ADDR ADDR ADDR ADDR ADDR])))
(def ^:private h-tt-iv    (delay (downcall "rocksky_top_tracks_interval" ADDR [ADDR I32 I32 ADDR I32 ADDR ADDR])))
(def ^:private h-ta-iv    (delay (downcall "rocksky_top_artists_interval" ADDR [ADDR I32 I32 ADDR I32 ADDR ADDR])))
(def ^:private h-songhash (delay (downcall "rocksky_song_hash" ADDR [ADDR ADDR ADDR])))
(def ^:private h-free     (delay (downcall "rocksky_string_free" nil [ADDR])))
(def ^:private h-login    (delay (downcall "rocksky_agent_login" ADDR [ADDR ADDR ADDR ADDR ADDR])))
(def ^:private h-last-err (delay (downcall "rocksky_last_error" ADDR [])))
(def ^:private h-afree    (delay (downcall "rocksky_agent_free" nil [ADDR])))
(def ^:private h-scrobble (delay (downcall "rocksky_agent_scrobble" ADDR [ADDR ADDR])))
(def ^:private h-scrobble-match (delay (downcall "rocksky_agent_scrobble_match" ADDR [ADDR ADDR])))
(def ^:private h-sync     (delay (downcall "rocksky_agent_sync_repo" ADDR [ADDR])))
(def ^:private h-hydrate  (delay (downcall "rocksky_agent_hydrate_from_jetstream" ADDR [ADDR])))
(def ^:private h-like     (delay (downcall "rocksky_agent_like" ADDR [ADDR ADDR ADDR])))
(def ^:private h-follow   (delay (downcall "rocksky_agent_follow" ADDR [ADDR ADDR])))
(def ^:private h-shout    (delay (downcall "rocksky_agent_shout" ADDR [ADDR ADDR ADDR ADDR])))
(def ^:private h-refresh  (delay (downcall "rocksky_agent_refresh_session" ADDR [ADDR])))

(defn- read-free
  "Read an owned C string returned by the core, then free it. nil on NULL."
  [^MemorySegment seg]
  (when (and seg (not (zero? (.address seg))))
    (let [s (.getString (.reinterpret seg Long/MAX_VALUE) 0)]
      (.invokeWithArguments ^MethodHandle @h-free (object-array [seg]))
      s)))

(defn- unwrap
  "Parse a {\"ok\"|\"error\"} envelope, throwing ex-info on error."
  [seg]
  (let [m (json/parse-string (read-free seg))]
    (if (contains? m "error")
      (throw (ex-info (str "rocksky: " (get m "error")) {:error (get m "error")}))
      (get m "ok"))))

;; ---- reads (unauthenticated) --------------------------------------------

(defn profile
  "An actor's detailed profile."
  ([actor] (profile actor nil))
  ([actor base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-profile
                                   (object-array [(.allocateFrom a (str (or base "")))
                                                  (.allocateFrom a (str actor))]))))))

(defn scrobbles
  "An actor's scrobbles, newest first."
  ([actor limit] (scrobbles actor limit 0 nil))
  ([actor limit offset base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-scrobbles
                                   (object-array [(.allocateFrom a (str (or base "")))
                                                  (.allocateFrom a (str actor))
                                                  (int limit) (int offset)]))))))

(defn top-tracks
  "Platform-wide top tracks chart. `base` overrides the AppView URL."
  ([limit] (top-tracks limit 0 nil))
  ([limit offset] (top-tracks limit offset nil))
  ([limit offset base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-toptracks
                                   (object-array [(.allocateFrom a (str (or base "")))
                                                  (int limit) (int offset)]))))))

(defn global-stats
  "Platform-wide totals."
  ([] (global-stats nil))
  ([base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-stats
                                   (object-array [(.allocateFrom a (str (or base "")))]))))))

(defn query
  "Universal read escape hatch — call any app.rocksky.* query by nsid. `params`
  is a map of string params; the whole read-query catalog is reachable here.

    (query \"app.rocksky.album.getAlbum\" {:uri uri})
    (query \"app.rocksky.charts.getScrobblesChart\" {:did did})"
  ([nsid params] (query nsid params nil nil))
  ([nsid params base] (query nsid params base nil))
  ([nsid params base token]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-get
                                   (object-array [(.allocateFrom a (str (or base "")))
                                                  (.allocateFrom a (str nsid))
                                                  (.allocateFrom a (json/generate-string params))
                                                  (.allocateFrom a (str (or token "")))]))))))

(defn match-song
  "Resolve full canonical metadata for a bare title + artist (matchSong)."
  ([title artist] (match-song title artist nil nil nil))
  ([title artist mb-id isrc base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-match
                                   (object-array [(.allocateFrom a (str (or base "")))
                                                  (.allocateFrom a (str title))
                                                  (.allocateFrom a (str artist))
                                                  (.allocateFrom a (str (or mb-id "")))
                                                  (.allocateFrom a (str (or isrc "")))]))))))

(defn- interval-parts
  "Normalize an interval into [unit n start end]. `iv` is :all, or a vector
  [:days n] / [:weeks n] / [:months n] / [:years n] / [:range start end]."
  [iv]
  (cond
    (or (nil? iv) (= :all iv)) ["all" 0 "" ""]
    (vector? iv) (let [[k a b] iv]
                   (if (= :range k)
                     ["range" 0 (str a) (str b)]
                     [(name k) (int a) "" ""]))
    :else (throw (ex-info "invalid interval" {:interval iv}))))

(defn top-tracks-interval
  "Top tracks chart over a typed date window (see `interval-parts` for the shape)."
  ([limit offset interval] (top-tracks-interval limit offset interval nil))
  ([limit offset interval base]
   (let [[u n s e] (interval-parts interval)]
     (with-open [^Arena a (Arena/ofConfined)]
       (unwrap (.invokeWithArguments ^MethodHandle @h-tt-iv
                                     (object-array [(.allocateFrom a (str (or base "")))
                                                    (int limit) (int offset)
                                                    (.allocateFrom a (str u)) (int n)
                                                    (.allocateFrom a (str s)) (.allocateFrom a (str e))])))))))

(defn top-artists-interval
  "Top artists chart over a typed date window (see `top-tracks-interval`)."
  ([limit offset interval] (top-artists-interval limit offset interval nil))
  ([limit offset interval base]
   (let [[u n s e] (interval-parts interval)]
     (with-open [^Arena a (Arena/ofConfined)]
       (unwrap (.invokeWithArguments ^MethodHandle @h-ta-iv
                                     (object-array [(.allocateFrom a (str (or base "")))
                                                    (int limit) (int offset)
                                                    (.allocateFrom a (str u)) (int n)
                                                    (.allocateFrom a (str s)) (.allocateFrom a (str e))])))))))

(defn song-hash
  "Identity hash of a song — identical across every Rocksky SDK."
  [title artist album]
  (with-open [^Arena a (Arena/ofConfined)]
    (read-free (.invokeWithArguments ^MethodHandle @h-songhash
                                     (object-array [(.allocateFrom a (str title))
                                                    (.allocateFrom a (str artist))
                                                    (.allocateFrom a (str album))])))))

;; ---- authenticated agent ------------------------------------------------
;;
;; Records are Clojure maps with camelCase string keys ("title", "artist",
;; "album", "albumArtist", "durationMs", …). An agent is an opaque native
;; handle — release it with `agent-close`.

(defn login
  "Log in with an app password, persisting the session at `session-path`."
  [session-path identifier password & {:keys [appview dedup-path]}]
  (with-open [^Arena a (Arena/ofConfined)]
    (let [^MemorySegment seg
          (.invokeWithArguments ^MethodHandle @h-login
                                (object-array [(.allocateFrom a (str session-path))
                                               (.allocateFrom a (str identifier))
                                               (.allocateFrom a (str password))
                                               (.allocateFrom a (str (or appview "")))
                                               (.allocateFrom a (str (or dedup-path "")))]))]
      (if (zero? (.address seg))
        (throw (ex-info (str "rocksky login: "
                             (or (read-free (.invokeWithArguments ^MethodHandle @h-last-err (object-array [])))
                                 "failed"))
                        {}))
        seg))))

(defn- agent-call [^MethodHandle h agent & args]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments h
                                  (object-array (cons agent (map #(.allocateFrom a (str %)) args)))))))

(defn scrobble
  "Scrobble a play (fans out to artist/album/song/scrobble). Returns the URIs."
  [agent track]
  (agent-call @h-scrobble agent (json/generate-string track)))

(defn scrobble-match
  "Scrobble from a title + artist. `input` is a map with camelCase keys: required
  :title/:artist; optional :album, :mbId, :isrc (match anchors) and :timestamp
  (scrobbled-at Unix seconds, default now). Resolves full metadata via matchSong,
  then fans out."
  [agent input]
  (agent-call @h-scrobble-match agent (json/generate-string input)))

(defn sync-repo
  "Download the caller's repo and (re)build the local dedup index (needs a
  :dedup-path at login). Returns the per-collection counts."
  [agent]
  (agent-call @h-sync agent))

(defn hydrate-from-jetstream
  "Keep the local dedup index hydrated from Jetstream in the background."
  [agent]
  (agent-call @h-hydrate agent))

(defn like       [agent uri cid] (agent-call @h-like agent uri cid))
(defn follow     [agent did]     (agent-call @h-follow agent did))
(defn shout      [agent subject-uri subject-cid message]
  (agent-call @h-shout agent subject-uri subject-cid message))
(defn refresh-session [agent]    (agent-call @h-refresh agent))

(defn agent-close
  "Release an agent's native handle."
  [^MemorySegment agent]
  (.invokeWithArguments ^MethodHandle @h-afree (object-array [agent]))
  nil)
