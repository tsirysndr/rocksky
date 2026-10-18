export const errorCodeImpl = (e) => (e && typeof e.code === "string" ? e.code : null);
export const errorName = (e) => (e && typeof e.name === "string" ? e.name : "");
export const errorFieldImpl = (e) => (k) => (e && typeof e[k] === "string" ? e[k] : null);

const describe = (e, depth) => {
  if (!(e instanceof Error)) return String(e);
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${e.name}: ${e.message}`];
  if (e instanceof AggregateError) for (const inner of e.errors) lines.push(describe(inner, depth + 1));
  if (e.cause !== undefined) {
    lines.push(`${indent}  caused by:`);
    lines.push(describe(e.cause, depth + 1));
  }
  return lines.join("\n");
};
export const describeError = (e) => describe(e, 0);
export const errorToForeign = (e) => e;
export const foreignToError = (x) => (x instanceof Error ? x : new Error(typeof x === "string" ? x : JSON.stringify(x)));

export const typeError = message => new TypeError(message);
