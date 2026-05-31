(ns rocksky.googledrive
  "Endpoints under app.rocksky.googledrive.*"
  (:require [rocksky.client :as c]))

(defn get-files
  "List files in Google Drive. Optional: `:at` (folder path)."
  ([client] (get-files client nil))
  ([client {:keys [at]}]
   (c/query client :app.rocksky.googledrive.getFiles {:at at})))

(defn get-file
  "Get a single file by `:file-id`. Required: `:file-id`."
  [client {:keys [file-id]}]
  (c/query client :app.rocksky.googledrive.getFile {:fileId file-id}))

(defn download-file
  "Download a file by `:file-id`. Required: `:file-id`."
  [client {:keys [file-id]}]
  (c/query client :app.rocksky.googledrive.downloadFile {:fileId file-id}))
