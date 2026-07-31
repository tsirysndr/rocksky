@module("../consts") external apiUrl: string = "API_URL"

@genType
type storageProvider = {
  id: string,
  label: string,
  endpoint: string,
  region: string,
  bucket: string,
  public_url: Null.t<string>,
  verified_at: Null.t<string>,
  created_at: string,
}

@genType
type createStorageProviderInput = {
  label: string,
  endpoint: string,
  region?: string,
  bucket: string,
  access_key: string,
  secret_key: string,
  public_url?: string,
}

// Auth header, computed per call (matches storage.ts's `headers()`).
let headers = (): Axios.config => {
  headers: Dict.fromArray([("authorization", Axios.bearer())]),
}

@genType
let getStorageProviders = async (): array<storageProvider> => {
  let res: Axios.response<array<storageProvider>> = await Axios.get(
    apiUrl ++ "/storage/providers",
    headers(),
  )
  res.data
}

@genType
let createStorageProvider = async (
  input: createStorageProviderInput,
): storageProvider => {
  let res: Axios.response<storageProvider> = await Axios.post(
    apiUrl ++ "/storage/providers",
    input,
    headers(),
  )
  res.data
}

@genType
let deleteStorageProvider = async (id: string): unit => {
  let _ = await Axios.delete(apiUrl ++ "/storage/providers/" ++ id, headers())
}
