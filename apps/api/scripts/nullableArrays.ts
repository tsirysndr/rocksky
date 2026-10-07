/** lex-cli 0.5 emits (T | null)[] for nullable arrays, but the lexicon means T[] | null. */
export function normalizeNullableArrays(source: string): string {
  return source.replace(/(:\s*)\(([^;\n]+?) \| null\)\[\]/g, "$1($2)[] | null");
}
