export const refToString = (ref) => (ref && typeof ref.toString === "function" ? ref.toString() : String(ref));
