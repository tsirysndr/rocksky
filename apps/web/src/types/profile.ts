export type Profile = {
  id: string;
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  createdAt: string;
  spotifyUser: {
    id: string;
    xataVersion: number;
    email: string;
    userId: string;
    isBetaUser: boolean;
    spotifyAppId: string;
    createdAt: string;
    updatedAt: string;
  };
  spotifyToken: {
    id: string;
    xataVersion: number;
    userId: string;
    spotifyAppId: string;
    createdAt: string;
    updatedAt: string;
  };
  spotifyConnected: boolean;
  googledrive: {
    id: string;
    email: string;
    isBetaUser: boolean;
    userId: string;
    xataVersion: number;
    createdAt: string;
    updatedAt: string;
  };
  dropbox: {
    id: string;
    email: string;
    isBetaUser: boolean;
    userId: string;
    xataVersion: number;
    createdAt: string;
    updatedAt: string;
  };
  googleDrive: {
    id: string;
    email: string;
    isBetaUser: boolean;
    userId: string;
    xataVersion: number;
    createdAt: string;
    updatedAt: string;
  };
};
