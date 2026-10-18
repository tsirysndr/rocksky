export const start = ms => () => {
  const controller = new AbortController();
  return { controller, timer: setTimeout(() => controller.abort(), ms) };
};
export const signal = handle => handle.controller.signal;
export const clear = handle => () => clearTimeout(handle.timer);
