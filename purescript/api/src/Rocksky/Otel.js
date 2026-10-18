export const killSelf = (signal) => () => {
  process.kill(process.pid, signal);
};
export const onceSignal = (signal) => (f) => () => {
  process.once(signal, () => f());
};
