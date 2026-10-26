export const parseCursor = value => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};
export const cursorString = value => Math.trunc(value).toString(10);
