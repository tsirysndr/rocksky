import { consola } from "consola";

export const logImpl = (level, args) => consola[level](...args);
export const msg = (s) => s;
export const addReporterImpl = (f) =>
  consola.addReporter({
    log(logObj) {
      f({ level: logObj.level, type: logObj.type, tag: logObj.tag ?? "", args: logObj.args });
    },
  });
export const mkEffectFn1Impl = (f) => (a) => f(a)();
export const setLevel = (n) => () => {
  consola.level = n;
};
