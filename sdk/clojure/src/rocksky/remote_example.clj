(ns ^:no-doc rocksky.remote-example
  "Tour of the remote-control glue: run a player and a controller side by side.

  Needs a Rocksky access token and the native lib (see ./build-core.sh or set
  ROCKSKY_NATIVE_LIB), plus a reachable remote-control endpoint.

  Run:  ROCKSKY_TOKEN=… clojure -M:native -m rocksky.remote-example
        ROCKSKY_TOKEN=… clojure -M:native -m rocksky.remote-example wss://api.rocksky.app/ws"
  (:require [rocksky.remote :as remote]))

(defn- run-player
  "A minimal controllable player: react to commands, advertise now-playing."
  [token url]
  (let [player (remote/connect-player token "Clojure Example Player" url)]
    (remote/listen player
                   {:play        (fn [] (println "[player] ▶ play"))
                    :pause       (fn [] (println "[player] ⏸ pause"))
                    :next        (fn [] (println "[player] ⏭ next"))
                    :previous    (fn [] (println "[player] ⏮ previous"))
                    :seek        (fn [ms] (println "[player] ⏩ seek" ms "ms"))
                    :queue-jump  (fn [i] (println "[player] queue-jump" i))
                    :queue-remove(fn [i] (println "[player] queue-remove" i))
                    :enqueue     (fn [c] (println "[player] enqueue" (count (:tracks c))
                                                  "track(s), mode" (:mode c)))
                    :error       (fn [t] (println "[player] error:" (.getMessage t)))})
    (remote/set-now-playing player {:title "Chaser" :artist "Calibro 35"
                                    :album "Jazzploitation" :durationMs 214000
                                    :elapsedMs 0 :isPlaying true})
    (remote/set-status player :playing)
    (remote/set-queue player [{:title "Chaser" :artist "Calibro 35" :durationMs 214000}]
                      0)
    player))

(defn- run-controller
  "A minimal remote UI: observe devices and pick/drive the first one it sees."
  [token url]
  (let [ctl (remote/connect-controller token "Clojure Example Controller" url)]
    (remote/listen ctl
                   {:devices     (fn [e]
                                   (println "[controller] devices:"
                                            (mapv #(get % "name") (get e "devices")))
                                   (when-let [d (first (get e "devices"))]
                                     (let [id (get d "deviceId")]
                                       (remote/set-primary ctl id)
                                       (remote/pause ctl id))))
                    :now-playing (fn [e] (println "[controller] now-playing on"
                                                  (get e "deviceName") "→"
                                                  (get-in e ["track" "title"])))
                    :status      (fn [e] (println "[controller] status" (get e "status")
                                                  "on" (get e "deviceName")))
                    :queue       (fn [e] (println "[controller] queue index" (get e "index")))
                    :error       (fn [t] (println "[controller] error:" (.getMessage t)))})
    ctl))

(defn -main [& args]
  (let [token (System/getenv "ROCKSKY_TOKEN")
        url   (first args)]
    (when-not token
      (println "Set ROCKSKY_TOKEN to a Rocksky access token first.")
      (System/exit 1))
    (let [player (run-player token url)
          ctl    (run-controller token url)]
      (println "connected — listening for 15s (Ctrl-C to stop earlier)…")
      (Thread/sleep 15000)
      (remote/disconnect player)
      (remote/disconnect ctl)
      (remote/close player)
      (remote/close ctl)
      (shutdown-agents)
      (println "done."))))
