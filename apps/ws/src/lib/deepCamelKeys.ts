import _ from "lodash";
import * as R from "ramda";

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
          [_.camelCase(String(key)), deepCamelCaseKeys(value)] as [string, any],
      ),
      R.fromPairs,
    )(obj as object);
  }
  return obj;
};

export const deepSnakeCaseKeys = <T>(obj: T): any => {
  if (Array.isArray(obj)) {
    return obj.map(deepSnakeCaseKeys);
  } else if (isObject(obj)) {
    return R.pipe(
      R.toPairs,
      R.map(
        ([key, value]) =>
          [_.snakeCase(String(key)), deepSnakeCaseKeys(value)] as [string, any],
      ),
      R.fromPairs,
    )(obj as object);
  }
  return obj;
};
