export const normalize = (value, form) => value.normalize(form);
export const isObject = value => typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
export const array = items => items.toArray();
