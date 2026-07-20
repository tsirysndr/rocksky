/** Convert an `at://…app.rocksky.<coll>/…` URI into a rocksky.app web link. */
export function rockskyLink(uri?: string): string {
  if (!uri) return "";
  const rest = uri.split("at://")[1];
  if (!rest) return "";
  return `https://rocksky.app/${rest.replace("app.rocksky.", "")}`;
}
