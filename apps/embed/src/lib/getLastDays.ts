import dayjs from "dayjs";

export default function getLastDays(days: number): [Date, Date] {
  const start = dayjs().subtract(days, "day").startOf("day").toDate();
  const end = dayjs().endOf("day").toDate();
  return [start, end];
}
