export const mkUnknownUserError = (did) => (message) => {
  const e = new Error(message);
  e.name = "UnknownUserError";
  e.did = did;
  return e;
};
