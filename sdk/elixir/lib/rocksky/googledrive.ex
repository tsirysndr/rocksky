defmodule Rocksky.GoogleDrive do
  @moduledoc "`app.rocksky.googledrive.*` endpoints. Require an authenticated client."

  alias Rocksky.HTTP

  @doc "List files at a Drive path. Params: `:at`."
  def get_files(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.googledrive.getFiles", params)

  @doc "Get a single file metadata. Params: `:fileId`."
  def get_file(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.googledrive.getFile", params)

  @doc "Download a file by id. Params: `:fileId`."
  def download_file(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.googledrive.downloadFile", params)
end
