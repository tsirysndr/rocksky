import { Key } from "react";
import { createProfileScopedState } from "./profileScoped";

// Selected profile tab, persisted per profile did.
export const useProfileActiveTab = createProfileScopedState<Key>(
  "rocksky:profile-tab",
  "0",
);

// Selected sub-tab of the profile "Library" tab, persisted per profile did.
export const useProfileLibraryTab = createProfileScopedState<Key>(
  "rocksky:profile-library-tab",
  "0",
);
