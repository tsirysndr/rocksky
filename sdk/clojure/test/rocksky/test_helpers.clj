(ns rocksky.test-helpers
  "Shared test fixtures and a mock HTTP fn that records every call.

  Use `(mock-client opts)` to build a client whose `:http-fn` returns
  `(:response opts)` and pushes the request map into the `calls` atom.
  Inspect requests with `(last-call client)` and `(all-calls client)`."
  (:require [cheshire.core :as json]
            [rocksky.client :as c]))

(defn json-response
  "Build an HTTP-style response map with a JSON body."
  ([body] (json-response 200 body))
  ([status body]
   {:status status
    :body   (json/generate-string body)
    :headers {"Content-Type" "application/json"}}))

(defn mock-client
  "Return [client calls-atom] where `client` is a `rocksky.client/client`
  whose `:http-fn` is replaced with a recorder.

  Opts:
    :response  Response to return (default 200 OK with empty JSON body).
               Can be a map, or a fn of request -> response.
    :token     Bearer token for the client.
    :base-url  Base URL for the client."
  [{:keys [response token base-url]
    :or   {response (json-response {})
           base-url "https://api.example.com"}}]
  (let [calls   (atom [])
        respond (if (fn? response) response (constantly response))
        http-fn (fn [req]
                  (swap! calls conj req)
                  (respond req))]
    [(c/client {:base-url base-url
                :token    token
                :http-fn  http-fn})
     calls]))

(defn last-call [calls-atom] (last @calls-atom))
(defn all-calls [calls-atom] @calls-atom)
(defn call-count [calls-atom] (count @calls-atom))
