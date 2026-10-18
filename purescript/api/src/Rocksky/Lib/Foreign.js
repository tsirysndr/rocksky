export const undefined = void 0;
export const stringify = (v) => {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s;
};
export const stringifyPretty = (v) => JSON.stringify(v, null, 2);
export const parseJsonImpl = (left) => (right) => (s) => {
  try {
    return right(JSON.parse(s));
  } catch (e) {
    return left(String(e.message ?? e));
  }
};

export const truthy = value => Boolean(value);
export const stringValue = value => String(value);
