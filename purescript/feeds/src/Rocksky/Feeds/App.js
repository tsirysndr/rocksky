import {ensureValidAtUri} from '@atproto/syntax';
export const validFeedUri = value => {
  try { ensureValidAtUri(value); return true; } catch { return false; }
};
