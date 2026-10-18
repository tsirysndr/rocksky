export const schedule = (ms, callback) => setTimeout(callback, ms);
export const cancel = timer => { clearTimeout(timer); };
