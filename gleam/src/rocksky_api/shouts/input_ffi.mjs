export const validUrl = value => { try {new URL(value);return true;} catch {return false;} };
export const utf16Length = value => value.length;
