// Both clients use these cache keys for song/shout like state, counts, and
// loved-song membership. Keep unrelated queries (audio, uploads, etc.) intact.
const likeQueryRoots = new Set([
  "likes", "shouts", "song", "songByUri", "story-song", "playerSong",
  "lovedTracks", "loved-tracks", "lovedSha256s", "profile",
  "feed", "infiniteFeed", "scrobble", "scrobbles", "infiniteScrobbles",
  "stories", "tracks", "infiniteTracks", "top-tracks",
  "artistTracks", "artist-tracks", "album", "playlist", "trackRecommendations",
]);

export const isLikeQuery = (queryKey: readonly unknown[]) =>
  typeof queryKey[0] === "string" && likeQueryRoots.has(queryKey[0]);
