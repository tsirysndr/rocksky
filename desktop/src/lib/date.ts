import dayjs from "dayjs";
import {
  LAST_180_DAYS,
  LAST_30_DAYS,
  LAST_365_DAYS,
  LAST_7_DAYS,
  LAST_90_DAYS,
} from "../consts";

export const getLastDays = (days: number): [Date, Date] => {
  const start = dayjs().subtract(days, "day").startOf("day").toDate();
  const end = dayjs().endOf("day").toDate();
  return [start, end];
};

// Resolve a persisted range id (LAST_7_DAYS, ALL_TIME, ...) into actual dates.
// Only the id is persisted — dates are recomputed on read so a stored range
// never goes stale.
export const getRangeDates = (id?: string): [Date, Date] | [] => {
  switch (id) {
    case LAST_7_DAYS:
      return getLastDays(7);
    case LAST_30_DAYS:
      return getLastDays(30);
    case LAST_90_DAYS:
      return getLastDays(90);
    case LAST_180_DAYS:
      return getLastDays(180);
    case LAST_365_DAYS:
      return getLastDays(365);
    default:
      return [];
  }
};

export const getLastWeek = (): [Date, Date] => {
  const start = dayjs().subtract(1, "week").startOf("week").toDate();
  const end = dayjs().subtract(1, "week").endOf("week").toDate();
  return [start, end];
};

export const getLastMonth = (): [Date, Date] => {
  const start = dayjs().subtract(1, "month").startOf("month").toDate();
  const end = dayjs().subtract(1, "month").endOf("month").toDate();
  return [start, end];
};

export const getLastYear = (): [Date, Date] => {
  const start = dayjs().subtract(1, "year").startOf("year").toDate();
  const end = dayjs().subtract(1, "year").endOf("year").toDate();
  return [start, end];
};
