defmodule Rocksky.Dropbox do
  @moduledoc "`app.rocksky.dropbox.*` endpoints. Require an authenticated client."

  alias Rocksky.HTTP

  @doc "List files at a Dropbox path. Params: `:at`."
  def get_files(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.dropbox.getFiles", params)

  @doc "Metadata for a Dropbox path. Params: `:path`."
  def get_metadata(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.dropbox.getMetadata", params)

  @doc "Generate a temporary download link. Params: `:path`."
  def get_temporary_link(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.dropbox.getTemporaryLink", params)

  @doc "Download a file by Dropbox file id. Params: `:fileId`."
  def download_file(client, params \\ []),
    do: HTTP.query(client, "app.rocksky.dropbox.downloadFile", params)
end
