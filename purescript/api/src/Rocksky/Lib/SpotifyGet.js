// SpotifyRequestError carries the upstream status so callers can tell a rate
// limit apart from a bad token or a genuine miss.
class SpotifyRequestError extends Error {
  constructor(status, operation, message) {
    super(message ?? `Spotify ${operation} failed: ${status}`);
    this.name = "SpotifyRequestError";
    this.status = status;
    this.operation = operation;
  }
  get isRateLimited() {
    return this.status === 429;
  }
}

export const spotifyRequestError = (status) => (operation) => (message) =>
  new SpotifyRequestError(status, operation, message === null ? undefined : message);
export const isSpotifyRequestError = (e) => e instanceof SpotifyRequestError;
export const spotifyErrorStatusImpl = (e) => (e instanceof SpotifyRequestError ? e.status : null);
export const jsNumber = (s) => Number(s);
