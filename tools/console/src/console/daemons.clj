(ns console.daemons
  "Rust services. All built `--release` and run in the foreground so you
  see logs and Ctrl-C kills them. Wrap with `sh/sh*` if you want them in
  the background of your REPL session — e.g.

      (def js (sh/sh* [\"cargo\" \"run\" \"-p\" \"rockskyd\" \"--release\" \"--\" \"jetstream\"]))
      (.destroy ^Process (:proc js))"
  (:require [console.shell :as sh]))

(defn dropbox      [] (sh/cargo "rockskyd" "dropbox" "serve"))
(defn googledrive  [] (sh/cargo "rockskyd" "googledrive" "serve"))
(defn jetstream    [] (sh/cargo "rockskyd" "jetstream"))
(defn playlists    [] (sh/cargo "rockskyd" "playlist"))
(defn scrobbler    [] (sh/cargo "rockskyd" "scrobbler"))
(defn spotify      [] (sh/cargo "rockskyd" "spotify"))
(defn webscrobbler [] (sh/cargo "rockskyd" "webscrobbler"))
(defn tracklist    [] (sh/cargo "rockskyd" "tracklist"))

(defn connect
  "Run rocksky-connect (WebSocket/JSON-RPC client)."
  []
  (sh/cargo "rocksky-connect"))

(defn storage
  "Run rocksky-storage S3 proxy server."
  []
  (sh/cargo "rocksky-storage" "serve"))
