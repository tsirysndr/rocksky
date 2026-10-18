export const isTid = (k) => /^[234567ab][234567abcdefghijklmnopqrstuvwxyz]{12}$/.test(k);
export const isJobId = (id) => /^[a-f0-9]{64}$/.test(id);
