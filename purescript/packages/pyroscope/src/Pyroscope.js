import Pyroscope from "@pyroscope/nodejs";
export const init = (o) => () => {
  Pyroscope.init(o);
};
export const start = () => {
  Pyroscope.start();
};
