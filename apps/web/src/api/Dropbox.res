@module("../consts") external apiUrl: string = "API_URL"

type dirEntry = {id: string, name: string, path: string, fileId: string}
type subdir = {id: string, name: string, fileId: string, path: string, parentId?: string}
type driveFile = {
  id: string,
  name: string,
  fileId: string,
  directoryId: string,
  trackId: string,
}

@genType
type filesListing = {
  parentDirectory: dirEntry,
  directory: dirEntry,
  directories: array<subdir>,
  files: array<driveFile>,
}

// Dropbox file metadata; `.tag` is a reserved-looking key so it's bound via @as.
@genType
type fileMeta = {
  @as(".tag") tag: string,
  id: string,
  name: string,
  path_display: string,
}

@genType
type temporaryLink = {link: string}

let authHeaders = (): Axios.headers => Dict.fromArray([("Authorization", Axios.bearer())])

@genType
let getFiles = async (id: option<string>): filesListing => {
  let res: Axios.response<filesListing> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.dropbox.getFiles",
    {headers: authHeaders(), params: {"at": id}},
  )
  res.data
}

// NOTE: same endpoint as getFiles in the original (getFiles path), but with a
// `path` param and a different (file-metadata) response shape. Preserved as-is.
@genType
let getFile = async (id: string): fileMeta => {
  let res: Axios.response<fileMeta> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.dropbox.getFiles",
    {headers: authHeaders(), params: {"path": id}},
  )
  res.data
}

@genType
let getTemporaryLink = async (id: string): temporaryLink => {
  let res: Axios.response<temporaryLink> = await Axios.getP(
    apiUrl ++ "/dropbox/temporary-link",
    {headers: authHeaders(), params: {"path": id}},
  )
  res.data
}
