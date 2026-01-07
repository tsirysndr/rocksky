import dayjs from "dayjs";

export const getLastDays = (days: number): [Date, Date] => {
  const start = dayjs().subtract(days, "day").startOf("day").toDate();
  const end = dayjs().endOf("day").toDate();
  return [start, end];
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
