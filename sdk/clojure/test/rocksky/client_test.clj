(ns rocksky.client-test
  (:require [cheshire.core :as json]
            [clojure.test :refer [deftest is testing]]
            [rocksky.client :as c]
            [rocksky.test-helpers :as h]))

(deftest client-defaults
  (let [client (c/client)]
    (is (= "https://api.rocksky.app" (:base-url client)))
    (is (= 30000 (:timeout-ms client)))
    (is (nil? (:token client)))))

(deftest client-trims-trailing-slash
  (is (= "http://localhost:3004"
         (:base-url (c/client {:base-url "http://localhost:3004/"})))
      "trailing slashes should be stripped from base-url")
  (is (= "http://localhost:3004"
         (:base-url (c/client {:base-url "http://localhost:3004///"})))
      "multiple trailing slashes are stripped"))

(deftest with-token-sets-bearer
  (let [client (-> (c/client) (c/with-token "tok-1"))]
    (is (= "tok-1" (:token client)))
    (is (= "tok-2" (:token (c/with-token client "tok-2")))
        "tokens replace, not stack")))

(deftest with-headers-merges
  (let [client (-> (c/client {:headers {"X-Trace" "1"}})
                   (c/with-headers {"X-User" "alice"}))]
    (is (= {"X-Trace" "1" "X-User" "alice"} (:headers client)))))

(deftest with-base-url-replaces
  (is (= "http://localhost:3004"
         (:base-url (-> (c/client) (c/with-base-url "http://localhost:3004/"))))))

(deftest query-sends-get-and-parses-json
  (let [[client calls] (h/mock-client {:response (h/json-response {:handle "alice"})})
        result (c/query client :app.rocksky.actor.getProfile {:did "did:plc:abc"})
        req    (h/last-call calls)]
    (is (= {:handle "alice"} result))
    (is (= :get (:method req)))
    (is (= "https://api.example.com/xrpc/app.rocksky.actor.getProfile" (:url req)))
    (is (= {"did" "did:plc:abc"} (:query-params req)))))

(deftest query-drops-nil-params
  (let [[client calls] (h/mock-client {})]
    (c/query client :app.rocksky.album.getAlbums {:limit 10 :offset nil :genre nil})
    (is (= {"limit" "10"} (:query-params (h/last-call calls)))
        "nil values must not show up in the query string")))

(deftest query-coerces-non-strings
  (let [[client calls] (h/mock-client {})]
    (c/query client :app.rocksky.scrobble.getScrobbles
             {:limit 50 :following true :did :alice})
    (is (= {"limit"     "50"
            "following" "true"
            "did"       "alice"}
           (:query-params (h/last-call calls))))))

(deftest query-supports-sequential-values
  (let [[client calls] (h/mock-client {})]
    (c/query client :app.rocksky.graph.getFollowers
             {:actor "alice" :dids ["did:1" "did:2"]})
    (let [params (:query-params (h/last-call calls))]
      (is (= "alice" (get params "actor")))
      (is (= ["did:1" "did:2"] (get params "dids"))))))

(deftest auth-header-added-when-token-present
  (let [[client calls] (h/mock-client {:token "secret"})]
    (c/query client :app.rocksky.actor.getProfile {:did "alice"})
    (is (= "Bearer secret"
           (get-in (h/last-call calls) [:headers "Authorization"])))))

(deftest auth-header-omitted-without-token
  (let [[client calls] (h/mock-client {})]
    (c/query client :app.rocksky.album.getAlbum {:uri "at://x"})
    (is (nil? (get-in (h/last-call calls) [:headers "Authorization"])))))

(deftest procedure-sends-post-with-json-body
  (let [[client calls] (h/mock-client {:response (h/json-response {:ok true})
                                       :token    "tok"})
        result (c/procedure client :app.rocksky.scrobble.createScrobble
                            {:title "Song" :artist "Artist"})
        req    (h/last-call calls)]
    (is (= {:ok true} result))
    (is (= :post (:method req)))
    (is (= "https://api.example.com/xrpc/app.rocksky.scrobble.createScrobble"
           (:url req)))
    (is (= :json (:content-type req)))
    (is (= {:title "Song" :artist "Artist"}
           (json/parse-string (:body req) true)))))

(deftest procedure-can-send-query-params-without-body
  (let [[client calls] (h/mock-client {})]
    (c/procedure client :app.rocksky.graph.followAccount nil {:account "bob"})
    (let [req (h/last-call calls)]
      (is (= :post (:method req)))
      (is (nil? (:body req)) "no JSON body when body arg is nil")
      (is (= {"account" "bob"} (:query-params req))))))

(deftest procedure-with-no-body-or-params
  (let [[client calls] (h/mock-client {})]
    (c/procedure client :app.rocksky.spotify.play)
    (let [req (h/last-call calls)]
      (is (= :post (:method req)))
      (is (nil? (:body req)))
      (is (nil? (:query-params req))))))

(deftest non-2xx-throws-with-ex-data
  (let [[client _] (h/mock-client {:response (h/json-response 404 {:error "NotFound"})})]
    (try
      (c/query client :app.rocksky.album.getAlbum {:uri "at://missing"})
      (is false "expected ex-info to be thrown")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (= 404 (:status data)))
          (is (= :app.rocksky.album.getAlbum (:nsid data)))
          (is (= :get (:method data)))
          (is (= {:error "NotFound"} (:body data))))))))

(deftest server-error-also-throws
  (let [[client _] (h/mock-client {:response (h/json-response 503 {:error "BadGateway"})})]
    (is (thrown? clojure.lang.ExceptionInfo
                 (c/procedure client :app.rocksky.scrobble.createScrobble
                              {:title "x" :artist "y"})))))
