@genType
type t = {
  id: string,
  name: string,
  lastFour: string,
  lastUsedAt: Null.t<string>,
  createdAt: string,
  updatedAt: string,
}

// TS side was `AccessToken & { token: string }`; ReScript records don't do
// intersection, so the created-token shape is spelled out in full.
@genType
type created = {
  id: string,
  name: string,
  lastFour: string,
  lastUsedAt: Null.t<string>,
  createdAt: string,
  updatedAt: string,
  token: string,
}
