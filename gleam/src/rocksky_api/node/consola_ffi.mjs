import { consola } from "consola";
import chalk from "chalk";

export const info = (m) => consola.info(m);
export const warn = (m) => consola.warn(m);
export const error = (m) => consola.error(m);
export const debug = (m) => consola.debug(m);
export const success = (m) => consola.success(m);
export const errorWith = (m, v) => consola.error(m, v);
export const warnWith = (m, v) => consola.warn(m, v);
export const infoWith = (m, v) => consola.info(m, v);
export const debugWith = (m, v) => consola.debug(m, v);
export const addReporter = (log) => consola.addReporter({ log: (o) => log(o) });

export const cyan = (s) => chalk.cyan(s);
export const green = (s) => chalk.green(s);
export const greenBright = (s) => chalk.greenBright(s);
export const yellow = (s) => chalk.yellow(s);
export const yellowBright = (s) => chalk.yellowBright(s);
export const red = (s) => chalk.red(s);
export const magenta = (s) => chalk.magenta(s);
export const gray = (s) => chalk.gray(s);
export const bold = (s) => chalk.bold(s);
