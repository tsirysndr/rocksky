import _ from "lodash";
import * as R from "ramda";

export const dedupeTracksKeepLyrics = (tracks) => {
  const trackMap = new Map();

  for (const track of tracks) {
    const key = `${track.discNumber} - ${track.trackNumber}`;

    if (!key) continue;

    const existing = trackMap.get(key);

    // If current has lyrics and either no existing or existing has no lyrics, replace it
    if (!existing || (!existing.lyrics && track.lyrics)) {
      trackMap.set(key, track);
    }
  }

  return Array.from(trackMap.values());
};

type AnyObject = Record<string, any>;

const isObject = (val: unknown): val is AnyObject =>
  typeof val === "object" && val !== null && !Array.isArray(val);

export const deepCamelCaseKeys = <T>(obj: T): any => {
  if (Array.isArray(obj)) {
    return obj.map(deepCamelCaseKeys);
  } else if (isObject(obj)) {
    return R.pipe(
      R.toPairs,
      R.map(
        ([key, value]) =>
          [_.camelCase(String(key)), deepCamelCaseKeys(value)] as [string, any]
      ),
      R.fromPairs
    )(obj as object);
  }
  return obj;
};
