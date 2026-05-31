(ns rocksky.charts
  "Endpoints under app.rocksky.charts.*"
  (:require [rocksky.client :as c]))

(defn get-scrobbles-chart
  "Get the scrobbles chart.

  Optional: `:did` `:artist-uri` `:album-uri` `:song-uri` `:genre`
  `:from` `:to`."
  ([client] (get-scrobbles-chart client nil))
  ([client {:keys [did artist-uri album-uri song-uri genre from to]}]
   (c/query client :app.rocksky.charts.getScrobblesChart
            {:did       did
             :artisturi artist-uri
             :albumuri  album-uri
             :songuri   song-uri
             :genre     genre
             :from      from
             :to        to})))

(defn get-top-artists
  "Get top artists.

  Optional: `:limit` `:offset` `:start-date` `:end-date`."
  ([client] (get-top-artists client nil))
  ([client {:keys [limit offset start-date end-date]}]
   (c/query client :app.rocksky.charts.getTopArtists
            {:limit     limit
             :offset    offset
             :startDate start-date
             :endDate   end-date})))

(defn get-top-tracks
  "Get top tracks.

  Optional: `:limit` `:offset` `:start-date` `:end-date`."
  ([client] (get-top-tracks client nil))
  ([client {:keys [limit offset start-date end-date]}]
   (c/query client :app.rocksky.charts.getTopTracks
            {:limit     limit
             :offset    offset
             :startDate start-date
             :endDate   end-date})))
