@genType
type spotifyUser = {
  id: string,
  xataVersion: float,
  email: string,
  userId: string,
  isBetaUser: bool,
  spotifyAppId: string,
  createdAt: string,
  updatedAt: string,
}

@genType
type spotifyToken = {
  id: string,
  xataVersion: float,
  userId: string,
  spotifyAppId: string,
  createdAt: string,
  updatedAt: string,
}

// googledrive, dropbox and googleDrive share one shape on the TS side.
@genType
type cloudDrive = {
  id: string,
  email: string,
  isBetaUser: bool,
  userId: string,
  xataVersion: float,
  createdAt: string,
  updatedAt: string,
}

@genType
type t = {
  id: string,
  did: string,
  handle: string,
  displayName: string,
  avatar: string,
  createdAt: string,
  spotifyUser: spotifyUser,
  spotifyToken: spotifyToken,
  spotifyConnected: bool,
  googledrive: cloudDrive,
  dropbox: cloudDrive,
  googleDrive: cloudDrive,
}
