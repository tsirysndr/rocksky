export const monthsAgoDate = months => {
  const date = new Date();
  if (months) date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0,10);
};
