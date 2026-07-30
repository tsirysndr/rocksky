@genType
type t = {
  id: string,
  name: string,
  picture: string,
  playCount: float,
  sha256: string,
  tags: Null.t<array<string>>,
  uniqueListeners: float,
  uri: string,
}
