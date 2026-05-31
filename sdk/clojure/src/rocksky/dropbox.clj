(ns rocksky.dropbox
  "Endpoints under app.rocksky.dropbox.*"
  (:require [rocksky.client :as c]))

(defn get-files
  "List files in Dropbox.

  Optional: `:at` (folder path)."
  ([client] (get-files client nil))
  ([client {:keys [at]}]
   (c/query client :app.rocksky.dropbox.getFiles {:at at})))

(defn get-metadata
  "Get metadata of a file or folder. Required: `:path`."
  [client {:keys [path]}]
  (c/query client :app.rocksky.dropbox.getMetadata {:path path}))

(defn get-temporary-link
  "Get a temporary link to a file. Required: `:path`."
  [client {:keys [path]}]
  (c/query client :app.rocksky.dropbox.getTemporaryLink {:path path}))

(defn download-file
  "Download a file by `:file-id`. Returns raw bytes — wrap the URL yourself
  if you'd rather stream. Required: `:file-id`."
  [client {:keys [file-id]}]
  (c/query client :app.rocksky.dropbox.downloadFile {:fileId file-id}))
