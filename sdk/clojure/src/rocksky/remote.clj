(ns rocksky.remote
  "Remote-control bindings: build a Rocksky-controllable player or a remote UI.

  Two roles over the remote-control WebSocket (remote-ws/PROTOCOL.md), both
  wrapping the shared Rust core's C ABI (crates/rocksky-uniffi) via JVM Panama
  FFM — the same opaque-handle style as `rocksky.core`'s agent:

    - a RemotePlayer advertises now-playing/status/queue and receives commands;
    - a RemoteController lists devices, picks the primary, and sends commands.

  Both use a poll model: a blocking `next-command`/`next-event` you loop on a
  background thread. `listen` does that for you — pass a handler map and it spawns
  a thread that dispatches parsed commands/events to your fns.

    (def player (remote/connect-player token \"My Player\"))
    (remote/listen player {:play  #(engine-play)
                           :pause #(engine-pause)
                           :seek  (fn [ms] (engine-seek ms))})
    (remote/set-now-playing player {:title \"…\" :artist \"…\" :durationMs 200000
                                    :elapsedMs 0 :isPlaying true})
    (remote/set-status player :playing)

    (def ctl (remote/connect-controller token \"My Controller\"))
    (remote/listen ctl {:devices     (fn [e] (render (get e \"devices\")))
                        :now-playing (fn [e] (show (get e \"track\")))})
    (remote/set-primary ctl device-id)
    (remote/pause ctl device-id)       ; nil/omitted target ⇒ broadcast

  Records/commands/events are Clojure maps with camelCase string keys — the same
  convention as `rocksky.core`. Requires JDK 22+ (run with
  --enable-native-access=ALL-UNNAMED) and the native lib built with the
  `remote-player` feature (the crate default)."
  (:refer-clojure :exclude [next])
  (:require [cheshire.core :as json]
            [clojure.string :as str]
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
(def ^:private I32  ValueLayout/JAVA_INT)     ; uint32_t
(def ^:private I64  ValueLayout/JAVA_LONG)    ; uint64_t
(def ^:private BOOL ValueLayout/JAVA_BOOLEAN) ; C _Bool (1 byte)

(defn- ^MethodHandle downcall
  "Bind a C function `name` to a MethodHandle. `ret` is nil for void."
  [name ret arg-layouts]
  (let [seg (.orElseThrow (.find ^SymbolLookup @lookup name))
        arr (into-array MemoryLayout arg-layouts)
        fd  (if ret
              (FunctionDescriptor/of ret arr)
              (FunctionDescriptor/ofVoid arr))]
    (.downcallHandle ^Linker @linker seg fd (make-array Linker$Option 0))))

(def ^:private h-free (delay (downcall "rocksky_string_free" nil [ADDR])))

;; ---- player handles -----------------------------------------------------
(def ^:private h-p-connect     (delay (downcall "rocksky_remote_player_connect" ADDR [ADDR ADDR ADDR])))
(def ^:private h-p-next        (delay (downcall "rocksky_remote_player_next_command" ADDR [ADDR])))
(def ^:private h-p-nowplaying  (delay (downcall "rocksky_remote_player_set_now_playing" ADDR [ADDR ADDR])))
(def ^:private h-p-status      (delay (downcall "rocksky_remote_player_set_status" ADDR [ADDR ADDR])))
(def ^:private h-p-queue       (delay (downcall "rocksky_remote_player_set_queue" ADDR [ADDR ADDR I32])))
(def ^:private h-p-disconnect  (delay (downcall "rocksky_remote_player_disconnect" ADDR [ADDR])))
(def ^:private h-p-free        (delay (downcall "rocksky_remote_player_free" nil [ADDR])))

;; ---- controller handles -------------------------------------------------
(def ^:private h-c-connect     (delay (downcall "rocksky_remote_controller_connect" ADDR [ADDR ADDR ADDR])))
(def ^:private h-c-next        (delay (downcall "rocksky_remote_controller_next_event" ADDR [ADDR])))
(def ^:private h-c-primary     (delay (downcall "rocksky_remote_controller_set_primary" ADDR [ADDR ADDR])))
(def ^:private h-c-command     (delay (downcall "rocksky_remote_controller_command" ADDR [ADDR ADDR ADDR])))
(def ^:private h-c-seek        (delay (downcall "rocksky_remote_controller_seek" ADDR [ADDR ADDR I64])))
(def ^:private h-c-qjump       (delay (downcall "rocksky_remote_controller_queue_jump" ADDR [ADDR ADDR I32])))
(def ^:private h-c-qremove     (delay (downcall "rocksky_remote_controller_queue_remove" ADDR [ADDR ADDR I32])))
(def ^:private h-c-enqueue     (delay (downcall "rocksky_remote_controller_enqueue" ADDR [ADDR ADDR ADDR ADDR BOOL I32])))
(def ^:private h-c-disconnect  (delay (downcall "rocksky_remote_controller_disconnect" ADDR [ADDR])))
(def ^:private h-c-free        (delay (downcall "rocksky_remote_controller_free" nil [ADDR])))

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

(defn- cstr
  "Allocate a NUL-terminated UTF-8 C string in `a` (nil ⇒ empty string)."
  [^Arena a s]
  (.allocateFrom a (str (or s ""))))

;; ---- lifecycle protocol -------------------------------------------------
;;
;; A player and a controller are opaque native handles wrapped in a record.
;; They share the same lifecycle verbs, so those live on a protocol; the
;; role-specific verbs are plain functions below.

(defprotocol Remote
  (disconnect [this]
    "Disconnect and stop the background task. Unblocks the `listen` loop (its
    next poll returns nil, ending the thread). The handle stays valid until
    `close`.")
  (close [this]
    "Release the native handle. Call once, after `disconnect`.")
  (listen [this handlers]
    "Spawn a background thread that loops the blocking poll and dispatches to
    `handlers` (a map of keyword ⇒ fn). Returns the `future`; stop it with
    `disconnect`. An optional `:error` handler receives any Throwable."))

(defrecord RemotePlayer [^MemorySegment handle])
(defrecord RemoteController [^MemorySegment handle])

;; ---- player -------------------------------------------------------------

(defn connect-player
  "Connect and register a controllable player. `token` is a Rocksky access token
  (JWT); `name` is the device-picker label; `url` may be nil for the public
  endpoint. Returns a `RemotePlayer`."
  ([token name] (connect-player token name nil))
  ([token name url]
   (with-open [^Arena a (Arena/ofConfined)]
     (let [^MemorySegment seg
           (.invokeWithArguments ^MethodHandle @h-p-connect
                                 (object-array [(cstr a token) (cstr a name) (cstr a url)]))]
       (->RemotePlayer seg)))))

(defn set-now-playing
  "Advertise the current track. `track` is a map with camelCase keys: :title,
  :artist, :album, :albumArtist, :albumArt, :durationMs, :elapsedMs, :isPlaying,
  plus optional audio info :codec (audio codec/container, e.g. \"mp3\", \"flac\")
  and :sampleRate (sample rate in Hz, e.g. 44100), included in the track payload
  when set and omitted otherwise."
  [^RemotePlayer player track]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-p-nowplaying
                                  (object-array [(:handle player)
                                                 (cstr a (json/generate-string track))])))))

(defn set-status
  "Advertise transport state — :playing, :paused, or :stopped (keyword or string)."
  [^RemotePlayer player status]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-p-status
                                  (object-array [(:handle player) (cstr a (name status))])))))

(defn set-queue
  "Advertise the playback queue + active index. `items` is a vector of queue-item
  maps (camelCase keys: :uploadId/:trackId, :title, :artist, :album,
  :albumArtist, :albumArt, :durationMs, :songUri, :albumUri, :trackNumber)."
  [^RemotePlayer player items index]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-p-queue
                                  (object-array [(:handle player)
                                                 (cstr a (json/generate-string (or items [])))
                                                 (int index)])))))

(defn next-command
  "Block until the next controller command; returns a parsed command map (string
  keys) or nil once disconnected. Prefer `listen` — this is the raw poll."
  [^RemotePlayer player]
  (unwrap (.invokeWithArguments ^MethodHandle @h-p-next (object-array [(:handle player)]))))

(defn- dispatch-command
  "Route one parsed command to the matching handler in `handlers`."
  [handlers cmd]
  (let [action (get cmd "action")
        k (keyword (str/replace (str action) "_" "-"))]
    (when-let [h (get handlers k)]
      (case (str action)
        ("play" "pause" "next" "previous") (h)
        "seek"          (h (get cmd "position"))
        "queue_jump"    (h (get cmd "index"))
        "queue_remove"  (h (get cmd "index"))
        "enqueue"       (h {:tracks     (get cmd "tracks")
                            :mode       (get cmd "mode")
                            :shuffle    (get cmd "shuffle")
                            :startIndex (get cmd "startIndex")})
        (h cmd)))))

(defn- player-loop [player handlers]
  (loop []
    (when-let [cmd (try (next-command player)
                        (catch Throwable t
                          (when-let [e (:error handlers)] (e t)) nil))]
      (try (dispatch-command handlers cmd)
           (catch Throwable t (when-let [e (:error handlers)] (e t))))
      (recur))))

;; ---- controller ---------------------------------------------------------

(defn connect-controller
  "Connect and register a controller (remote UI). Args as `connect-player`.
  Returns a `RemoteController`."
  ([token name] (connect-controller token name nil))
  ([token name url]
   (with-open [^Arena a (Arena/ofConfined)]
     (let [^MemorySegment seg
           (.invokeWithArguments ^MethodHandle @h-c-connect
                                 (object-array [(cstr a token) (cstr a name) (cstr a url)]))]
       (->RemoteController seg)))))

(defn set-primary
  "Choose the primary (scrobble/profile) device by id."
  [^RemoteController controller device-id]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-c-primary
                                  (object-array [(:handle controller) (cstr a device-id)])))))

(defn- command
  "Send a simple command (play|pause|next|previous). nil/empty `target` ⇒ broadcast."
  [^RemoteController controller action target]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-c-command
                                  (object-array [(:handle controller)
                                                 (cstr a (name action))
                                                 (cstr a target)])))))

(defn play
  "Play on `target` (a device id), or omit/nil to broadcast to all devices."
  ([controller] (play controller nil))
  ([controller target] (command controller "play" target)))

(defn pause
  ([controller] (pause controller nil))
  ([controller target] (command controller "pause" target)))

(defn next
  ([controller] (next controller nil))
  ([controller target] (command controller "next" target)))

(defn previous
  ([controller] (previous controller nil))
  ([controller target] (command controller "previous" target)))

(defn seek
  "Seek `target` to `position-ms` (nil target ⇒ broadcast)."
  [^RemoteController controller target position-ms]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-c-seek
                                  (object-array [(:handle controller)
                                                 (cstr a target)
                                                 (long position-ms)])))))

(defn queue-jump
  "Jump to `index` in `target`'s queue (nil target ⇒ broadcast)."
  [^RemoteController controller target index]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-c-qjump
                                  (object-array [(:handle controller)
                                                 (cstr a target)
                                                 (int index)])))))

(defn queue-remove
  "Remove queue item `index` on `target` (nil target ⇒ broadcast)."
  [^RemoteController controller target index]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments ^MethodHandle @h-c-qremove
                                  (object-array [(:handle controller)
                                                 (cstr a target)
                                                 (int index)])))))

(defn enqueue
  "Enqueue `tracks` (a vector of queue-item maps) on `target` (nil ⇒ broadcast).
  `mode` is :now | :next | :last (default :now); `shuffle` a bool (default false);
  `start-index` an int (default 0)."
  ([controller target tracks] (enqueue controller target tracks :now false 0))
  ([^RemoteController controller target tracks mode shuffle start-index]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-c-enqueue
                                   (object-array [(:handle controller)
                                                  (cstr a target)
                                                  (cstr a (json/generate-string (or tracks [])))
                                                  (cstr a (name mode))
                                                  (boolean shuffle)
                                                  (int start-index)]))))))

(defn next-event
  "Block until the next update; returns a parsed event map (string keys) or nil
  once disconnected. Prefer `listen` — this is the raw poll."
  [^RemoteController controller]
  (unwrap (.invokeWithArguments ^MethodHandle @h-c-next (object-array [(:handle controller)]))))

(defn- dispatch-event
  "Route one parsed event to the handler keyed by its `type`
  (:devices :device-registered :device-unregistered :primary-changed
  :now-playing :status :queue). The handler receives the whole event map. A
  :now-playing event's \"track\" map includes optional \"codec\" / \"sampleRate\"
  audio info when the player advertised it."
  [handlers ev]
  (let [k (keyword (str/replace (str (get ev "type")) "_" "-"))]
    (when-let [h (get handlers k)]
      (h ev))))

(defn- controller-loop [controller handlers]
  (loop []
    (when-let [ev (try (next-event controller)
                       (catch Throwable t
                         (when-let [e (:error handlers)] (e t)) nil))]
      (try (dispatch-event handlers ev)
           (catch Throwable t (when-let [e (:error handlers)] (e t))))
      (recur))))

;; ---- lifecycle impls ----------------------------------------------------

(extend-protocol Remote
  RemotePlayer
  (disconnect [this]
    (unwrap (.invokeWithArguments ^MethodHandle @h-p-disconnect (object-array [(:handle this)]))))
  (close [this]
    (.invokeWithArguments ^MethodHandle @h-p-free (object-array [(:handle this)]))
    nil)
  (listen [this handlers]
    (future (player-loop this handlers)))

  RemoteController
  (disconnect [this]
    (unwrap (.invokeWithArguments ^MethodHandle @h-c-disconnect (object-array [(:handle this)]))))
  (close [this]
    (.invokeWithArguments ^MethodHandle @h-c-free (object-array [(:handle this)]))
    nil)
  (listen [this handlers]
    (future (controller-loop this handlers))))
