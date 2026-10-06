// matchSong has a ten-second response deadline. Optional metadata must stop
// earlier so a provider timeout does not discard a song we already found.
export const enrichmentSignal = (parent: AbortSignal, timeoutMs = 8000) =>
  AbortSignal.any([parent, AbortSignal.timeout(timeoutMs)]);
