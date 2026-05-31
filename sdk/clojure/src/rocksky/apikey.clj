(ns rocksky.apikey
  "Endpoints under app.rocksky.apikey.*"
  (:require [rocksky.client :as c]))

(defn get-apikeys
  "List API keys for the authenticated user.

  Optional: `:limit` `:offset`."
  ([client] (get-apikeys client nil))
  ([client {:keys [limit offset]}]
   (c/query client :app.rocksky.apikey.getApikeys
            {:limit limit :offset offset})))

(defn create-apikey
  "Create a new API key.

  Required: `:name`. Optional: `:description`."
  [client {:keys [name description] :as body}]
  (c/procedure client :app.rocksky.apikey.createApikey body))

(defn update-apikey
  "Update an existing API key.

  Required: `:id` `:name`. Optional: `:description`."
  [client {:keys [id name description] :as body}]
  (c/procedure client :app.rocksky.apikey.updateApikey body))

(defn remove-apikey
  "Remove an API key.

  Required: `:id`."
  [client {:keys [id]}]
  (c/procedure client :app.rocksky.apikey.removeApikey nil {:id id}))
