import dayjs from "dayjs";

export const getLastDays = (days: number): [Date, Date] => {
  const start = dayjs().subtract(days, "day").startOf("day").toDate();
  const end = dayjs().endOf("day").toDate();
  return [start, end];
};
