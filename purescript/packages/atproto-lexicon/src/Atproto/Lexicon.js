import { Lexicons } from "@atproto/lexicon";

export const create = (docs) => new Lexicons(docs);
export const validateImpl = (l) => (uri) => (v) => {
  const r = l.validate(uri, v);
  return r.success ? { success: true, error: null } : { success: false, error: String(r.error?.message ?? r.error) };
};
export const isRecordOf = (nsid) => (v) => v !== null && typeof v === "object" && v.$type === nsid;
