import Pyroscope from "@pyroscope/nodejs";
export const start = (serverAddress, appName) => {
  Pyroscope.init({ serverAddress, appName });
  Pyroscope.start();
};
