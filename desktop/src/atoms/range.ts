import { LAST_7_DAYS } from "../consts";
import { createProfileScopedState } from "./profileScoped";

// "Last x days" selections of the profile overview sections, persisted per
// profile did. Only the range id is stored — the actual dates are derived with
// `getRangeDates` so a persisted range never goes stale.
export const useTopArtistsRange = createProfileScopedState<string>(
  "rocksky:profile-top-artists-range",
  LAST_7_DAYS,
);

export const useTopAlbumsRange = createProfileScopedState<string>(
  "rocksky:profile-top-albums-range",
  LAST_7_DAYS,
);

export const useTopTracksRange = createProfileScopedState<string>(
  "rocksky:profile-top-tracks-range",
  LAST_7_DAYS,
);
