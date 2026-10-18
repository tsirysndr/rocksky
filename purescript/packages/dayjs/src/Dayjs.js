import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import utcPlugin from "dayjs/plugin/utc.js";

dayjs.extend(customParseFormat);
dayjs.extend(utcPlugin);

export const now = () => dayjs();
export const unix = (s) => dayjs.unix(s);
export const utc = (s) => dayjs.utc(s);
export const utcFormat = (s) => (fmt) => dayjs.utc(s, fmt);
export const parse = (s) => dayjs(s);
export const parseFormat = (s) => (fmt) => dayjs(s, fmt);
export const fromDate = (d) => dayjs(d);
export const fromMillis = (ms) => dayjs(ms);
export const toISOStringImpl = (d) => (d.isValid() ? d.toISOString() : null);
export const toUnix = (d) => d.unix();
export const valueOf = (d) => d.valueOf();
export const toDate = (d) => d.toDate();
export const format = (d) => (fmt) => d.format(fmt);
export const isValid = (d) => d.isValid();
export const addImpl = (d) => (n) => (unit) => d.add(n, unit);
export const subtractImpl = (d) => (n) => (unit) => d.subtract(n, unit);
export const diffImpl = (a) => (b) => (unit) => a.diff(b, unit);
export const startOfImpl = (d) => (unit) => d.startOf(unit);
export const endOfImpl = (d) => (unit) => d.endOf(unit);
export const isBefore = (a) => (b) => a.isBefore(b);
export const isAfter = (a) => (b) => a.isAfter(b);
export const isSameImpl = (a) => (b) => (unit) => a.isSame(b, unit);
export const toUtc = (d) => d.utc();
export const toLocal = (d) => d.local();

export const utcInput = input => format => () => dayjs.utc(input, format ?? undefined);
