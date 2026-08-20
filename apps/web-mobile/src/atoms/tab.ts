import { LAST_7_DAYS } from "../consts";
import { createProfileScopedState } from "./profileScoped";

// Selected profile tab, persisted per profile did.
export const useProfileActiveTab = createProfileScopedState<number>(
  "rocksky:profile-tab",
  0,
);

// Selected sub-tab of the profile "Library" tab, persisted per profile did.
export const useProfileLibraryTab = createProfileScopedState<number>(
  "rocksky:profile-library-tab",
  0,
);

// "Last x days" selection of the profile overview charts, persisted per profile
// did. Only the range id is stored — the dates are derived on read so a
// persisted range never goes stale.
export const useProfileOverviewRange = createProfileScopedState<string>(
  "rocksky:profile-overview-range",
  LAST_7_DAYS,
);
