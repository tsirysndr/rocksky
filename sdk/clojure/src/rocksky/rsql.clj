(ns rocksky.rsql
  "Builder for RSQL filter expressions, accepted by the `filter` parameter of
  the catalog and scrobble-feed queries (app.rocksky.song.getSongs,
  app.rocksky.artist.getArtists, app.rocksky.album.getAlbums,
  app.rocksky.scrobble.getScrobbles).

    (require '[rocksky.rsql :as rsql])

    (-> (rsql/eq :artist \"Daft Punk\")
        (rsql/and (rsql/gt :duration 200000))
        (rsql/or (rsql/in :genre [\"house\" \"electro\"]))
        rsql/build)
    ;; => artist==\"Daft Punk\";duration=gt=200000,genre=in=(house,electro)

  Fields are keywords or strings; dotted selectors reach joined entities
  (:track.artist → track.artist). String values are quoted and escaped
  automatically when they contain characters RSQL reserves; `*` wildcards
  pass through unquoted so (eq :artist \"Daft*\") matches case-insensitively.

  Pure Clojure — no native lib, safe to require anywhere."
  (:refer-clojure :exclude [and or])
  (:require [clojure.string :as string]))

(defn- field-name
  "Render a field selector. Keywords use name (a namespaced keyword joins
  namespace and name with \".\", so :track/artist and :track.artist both
  render track.artist); strings pass through."
  [field]
  (if (keyword? field)
    (if-let [ns' (namespace field)]
      (str ns' "." (name field))
      (name field))
    (str field)))

(def ^:private safe-value
  "Characters that never need quoting in an RSQL value (`*` kept bare so
  wildcards work)."
  #"[A-Za-z0-9_.:@*+-]+")

(defn- render-value [value]
  (cond
    (clojure.core/or (number? value) (boolean? value))
    (str value)

    :else
    (let [s (if (keyword? value) (name value) (str value))]
      (if (clojure.core/and (pos? (count s)) (re-matches safe-value s))
        s
        (str "\"" (-> s
                      (string/replace "\\" "\\\\")
                      (string/replace "\"" "\\\"")) "\"")))))

(defn- node [kind expr] {:kind kind :expr expr})

(defn- comparison [field op value]
  (node :comparison (str (field-name field) op (render-value value))))

(defn- list-comparison [op-name op field values]
  (when (empty? values)
    (throw (ex-info (str "rsql/" op-name " needs at least one value")
                    {:field field :op op-name})))
  (node :comparison
        (str (field-name field) op
             "(" (string/join "," (map render-value values)) ")")))

(defn eq
  "`field==value` — equals; `*` in string values is a wildcard."
  [field value] (comparison field "==" value))

(defn ne
  "`field!=value` — not equals."
  [field value] (comparison field "!=" value))

(defn gt
  "`field=gt=value` — greater than."
  [field value] (comparison field "=gt=" value))

(defn ge
  "`field=ge=value` — greater than or equal."
  [field value] (comparison field "=ge=" value))

(defn lt
  "`field=lt=value` — less than."
  [field value] (comparison field "=lt=" value))

(defn le
  "`field=le=value` — less than or equal."
  [field value] (comparison field "=le=" value))

(defn in
  "`field=in=(a,b)` — matches any of the values. Throws on an empty coll."
  [field values] (list-comparison "in" "=in=" field values))

(defn out
  "`field=out=(a,b)` — matches none of the values. Throws on an empty coll."
  [field values] (list-comparison "out" "=out=" field values))

(defn is-null
  "`field==null` — the field is NULL."
  [field] (node :comparison (str (field-name field) "==null")))

(defn is-not-null
  "`field!=null` — the field is not NULL."
  [field] (node :comparison (str (field-name field) "!=null")))

(defn- render-in-and
  "An :or operand is parenthesized inside an AND to keep RSQL precedence."
  [{:keys [kind expr]}]
  (if (= :or kind) (str "(" expr ")") expr))

(defn and
  "Both sides must match (`;`). Shadows clojure.core/and inside this ns."
  [a b]
  (node :and (str (render-in-and a) ";" (render-in-and b))))

(defn or
  "Either side may match (`,`). Shadows clojure.core/or inside this ns."
  [a b]
  (node :or (str (:expr a) "," (:expr b))))

(defn build
  "The RSQL expression string to send as the `filter` query param. Also
  accepts an already-built string and returns it unchanged."
  [f]
  (if (string? f) f (:expr f)))
