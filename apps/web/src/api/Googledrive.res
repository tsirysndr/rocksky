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

@genType
type fileMeta = {id: string, mimeType: string, name: string, parents: array<string>}

let authHeaders = (): Axios.headers => Dict.fromArray([("Authorization", Axios.bearer())])

@genType
let getFiles = async (parentId: option<string>): filesListing => {
  let res: Axios.response<filesListing> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.googledrive.getFiles",
    {headers: authHeaders(), params: {"at": parentId}},
  )
  res.data
}

@genType
let getFile = async (id: string): fileMeta => {
  let res: Axios.response<fileMeta> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.googledrive.getFile",
    {headers: authHeaders(), params: {"id": id}},
  )
  res.data
}
