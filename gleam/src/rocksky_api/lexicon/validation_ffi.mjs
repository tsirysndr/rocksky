import { Lexicons } from '@atproto/lexicon';
import { Ok, Error as GError } from '../../gleam.mjs';
let lexicons;
export const validate = (docs, collection, value) => {
  try {
    lexicons ??= new Lexicons(docs.toArray());
    const result=lexicons.validate(collection,value);
    return result.success ? new Ok(undefined) : new GError(result.error);
  } catch(error) { return new GError(error); }
};
