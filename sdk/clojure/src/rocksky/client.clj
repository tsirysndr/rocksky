(ns rocksky.client
  "Core HTTP client for the Rocksky XRPC API.

  A client is just a map. You build one with `client`, optionally thread
  `with-token` / `with-base-url` / `with-headers` to extend it, and pass
  it as the first argument to every endpoint function in
  `rocksky.actor`, `rocksky.album`, etc.

  Two low-level helpers — `query` and `procedure` — back every endpoint
  fn. They translate XRPC's GET/POST split into `clj-http` calls and
  return the parsed JSON body. On non-2xx responses they throw
  `ex-info` with `:status`, `:body`, and `:nsid` in the ex-data."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.string :as str]))

(def ^:const default-base-url "https://api.rocksky.app")

(defn client
  "Build a Rocksky client.

   Options:
     :base-url   Base URL of the Rocksky API. Defaults to https://api.rocksky.app.
     :token      Bearer token (JWT) for authenticated endpoints. Optional.
     :headers    Extra default headers (map). Optional.
     :timeout-ms Per-request timeout in ms. Defaults to 30000.
     :http-fn    Override the HTTP fn (takes a clj-http request map). Useful for tests."
  ([] (client {}))
  ([{:keys [base-url token headers timeout-ms http-fn]
     :or   {base-url   default-base-url
            headers    {}
            timeout-ms 30000}}]
   {:base-url   (str/replace base-url #"/+$" "")
    :token      token
    :headers    headers
    :timeout-ms timeout-ms
    :http-fn    (or http-fn http/request)}))

(defn with-token
  "Return a new client with `token` set as the Bearer credential."
  [c token]
  (assoc c :token token))

(defn with-base-url
  "Return a new client with a different `base-url`."
  [c base-url]
  (assoc c :base-url (str/replace base-url #"/+$" "")))

(defn with-headers
  "Return a new client with extra default `headers` merged in."
  [c headers]
  (update c :headers merge headers))

(defn- ->header-name [k]
  (if (keyword? k) (name k) (str k)))

(defn- auth-headers [{:keys [token]}]
  (cond-> {}
    token (assoc "Authorization" (str "Bearer " token))))

(defn- default-headers [c]
  (into (auth-headers c)
        (map (fn [[k v]] [(->header-name k) v]))
        (:headers c)))

(defn- ->query-param
  "Coerce a param value to a string clj-http can serialize.

  Booleans are emitted as 'true'/'false'; everything else uses `str`."
  [v]
  (cond
    (nil? v)     nil
    (boolean? v) (str v)
    (keyword? v) (name v)
    :else        (str v)))

(defn- prep-params
  "Drop nil values and coerce remaining values to strings.

  Sequence values are passed through so clj-http can repeat the key."
  [params]
  (when (seq params)
    (into {}
          (keep (fn [[k v]]
                  (cond
                    (nil? v)        nil
                    (sequential? v) [(name k) (mapv ->query-param v)]
                    :else           [(name k) (->query-param v)])))
          params)))

(defn- nsid->url [c nsid]
  (str (:base-url c) "/xrpc/" (name nsid)))

(defn- parse-body [body]
  (cond
    (nil? body)    nil
    (string? body) (try (json/parse-string body true) (catch Exception _ body))
    :else          body))

(defn- request*
  "Execute a request and return parsed JSON body.

  Throws ex-info on non-2xx responses with :status, :body, :nsid in ex-data."
  [{:keys [http-fn timeout-ms] :as c} method nsid req]
  (let [resp (http-fn (merge {:method            method
                              :url               (nsid->url c nsid)
                              :headers           (default-headers c)
                              :accept            :json
                              :as                :json
                              :throw-exceptions  false
                              :coerce            :always
                              :socket-timeout    timeout-ms
                              :connection-timeout timeout-ms}
                             req))
        status (:status resp)]
    (if (and status (<= 200 status 299))
      (parse-body (:body resp))
      (throw (ex-info (str "Rocksky XRPC " (name nsid) " failed with status " status)
                      {:status status
                       :nsid   nsid
                       :method method
                       :body   (parse-body (:body resp))})))))

(defn query
  "Call an XRPC query (GET /xrpc/<nsid>).

  `params` is a map of query string parameters. nil values are dropped;
  sequential values are repeated. Returns the parsed JSON body."
  ([c nsid] (query c nsid nil))
  ([c nsid params]
   (request* c :get nsid
             (cond-> {}
               (seq params) (assoc :query-params (prep-params params))))))

(defn procedure
  "Call an XRPC procedure (POST /xrpc/<nsid>).

  Optional `params` map is sent as query string. Optional `body` map is
  sent as a JSON request body. Returns the parsed JSON body."
  ([c nsid]
   (procedure c nsid nil nil))
  ([c nsid body]
   (procedure c nsid body nil))
  ([c nsid body params]
   (request* c :post nsid
             (cond-> {:content-type :json}
               (seq params) (assoc :query-params (prep-params params))
               body         (assoc :body (json/generate-string body))))))
