export type FeedScrobble = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  cover: string;
  date: string;
  createdAt?: string;
  user: string;
  userDisplayName: string;
  userAvatar: string;
  tags: string[];
  likesCount: number;
  liked: boolean;
  trackUri: string;
  albumUri: string;
  artistUri: string;
  trackNumber?: number;
  discNumber?: number;
  duration?: number;
  sha256?: string;
  mbId?: string | null;
  youtubeLink?: string | null;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  composer?: string | null;
  genre?: string | null;
  label?: string | null;
  copyrightMessage?: string | null;
};

export type FeedGenerator = {
  id: string;
  name: string;
  uri: string;
  description: string;
  did: string;
  avatar?: string;
  creator?: {
    avatar?: string;
    displayName: string;
    handle: string;
    did: string;
    id: string;
  };
};

export type Story = {
  liked?: boolean;
  likesCount?: number;
  id: string;
  title: string;
  artist: string;
  albumArt?: string;
  artistUri?: string;
  albumArtist?: string;
  album?: string;
  albumUri?: string;
  uri: string;
  trackUri: string;
  trackId: string;
  avatar?: string;
  handle: string;
  did: string;
  createdAt: string;
};
