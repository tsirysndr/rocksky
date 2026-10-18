export const contains = (h, n) => h.includes(n);
export const lower = (s) => s.toLowerCase();

export const hasCode = (error, codes) => {
  const allowed=new Set(codes.toArray());
  const seen=new Set();
  while(error && typeof error==='object' && !seen.has(error)) {
    seen.add(error);
    if(allowed.has(error.code)) return true;
    error=error.cause;
  }
  return false;
};
