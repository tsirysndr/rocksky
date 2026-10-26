export const omitMissing = paths => json => {
  const remove = (value, path) => {
    if (value === null || typeof value !== "object" || path.length === 0) return value;
    const [key, ...rest] = path;
    if (key === "*" && Array.isArray(value)) return value.map(item => remove(item, rest));
    if (!Object.hasOwn(value, key)) return value;
    const copy = { ...value };
    if (rest.length === 0 && copy[key] === null) delete copy[key];
    else copy[key] = remove(copy[key], rest);
    return copy;
  };
  return paths.reduce(remove, json);
};
