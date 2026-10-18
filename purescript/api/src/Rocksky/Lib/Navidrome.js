export const mkNavidromeError = (code) => (message) => {
  const e = new Error(message);
  e.name = "NavidromeError";
  e.code = String(code);
  return e;
};
export const mkUnknownUserError = (did) => (message) => {
  const e = new Error(message);
  e.name = "UnknownUserError";
  e.did = did;
  return e;
};
