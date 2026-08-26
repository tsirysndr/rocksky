export type TokenKind =
  | "field"
  | "unknown-field"
  | "op"
  | "value"
  | "string"
  | "logic"
  | "paren"
  | "space"
  | "error";

export type Token = {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
};

export const COMPARISON_OPS = [
  "==",
  "!=",
  "=gt=",
  "=ge=",
  "=lt=",
  "=le=",
  "=in=",
  "=out=",
  ">=",
  "<=",
  ">",
  "<",
] as const;

export const LOGIC_OPS = [";", ",", "and", "or"] as const;

const SELECTOR_CHAR = /[A-Za-z0-9_.-]/;
const VALUE_CHAR = /[A-Za-z0-9_.:@*+/-]/;

type Expect = "field" | "op" | "value" | "logic";

/**
 * Tokenizes an RSQL expression for highlighting and completion. It never
 * throws: anything it can't classify comes back as an `error` token so the
 * editor can underline it in place.
 */
export function tokenize(input: string, knownFields?: Set<string>): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let expect: Expect = "field";
  let inList = 0;

  const push = (kind: TokenKind, start: number, end: number) => {
    tokens.push({ kind, text: input.slice(start, end), start, end });
  };

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      const start = i;
      while (i < input.length && /\s/.test(input[i])) i++;
      push("space", start, i);
      continue;
    }

    if (ch === "(" || ch === ")") {
      if (ch === "(" && expect === "value") inList++;
      if (ch === ")" && inList > 0) {
        inList--;
        expect = "logic";
      }
      push("paren", i, i + 1);
      i++;
      if (ch === "(" && inList === 0) expect = "field";
      continue;
    }

    if (ch === ";" || ch === ",") {
      push("logic", i, i + 1);
      i++;
      if (!inList) expect = "field";
      continue;
    }

    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i++;
      let closed = false;
      while (i < input.length) {
        if (input[i] === "\\") {
          i += 2;
          continue;
        }
        if (input[i] === quote) {
          i++;
          closed = true;
          break;
        }
        i++;
      }
      push(closed ? "string" : "error", start, i);
      if (!inList) expect = "logic";
      continue;
    }

    if (expect === "op") {
      const op = COMPARISON_OPS.find((candidate) =>
        input.startsWith(candidate, i),
      );
      if (op) {
        push("op", i, i + op.length);
        i += op.length;
        expect = "value";
        continue;
      }
      const start = i;
      while (i < input.length && /[=!<>]/.test(input[i])) i++;
      if (i === start) i++;
      push("error", start, i);
      expect = "value";
      continue;
    }

    if (expect === "value") {
      const start = i;
      while (i < input.length && VALUE_CHAR.test(input[i])) i++;
      if (i === start) {
        i++;
        push("error", start, i);
        continue;
      }
      push("value", start, i);
      if (!inList) expect = "logic";
      continue;
    }

    if (SELECTOR_CHAR.test(ch)) {
      const start = i;
      while (i < input.length && SELECTOR_CHAR.test(input[i])) i++;
      const word = input.slice(start, i);

      if (expect === "logic" && (word === "and" || word === "or")) {
        push("logic", start, i);
        expect = "field";
        continue;
      }

      const unknown = !!knownFields && !knownFields.has(word);
      push(unknown ? "unknown-field" : "field", start, i);
      expect = "op";
      continue;
    }

    push("error", i, i + 1);
    i++;
  }

  return tokens;
}

export type Completion = {
  /** What the caret is positioned to complete. */
  what: "field" | "op" | "value";
  /** The partial text already typed, which the suggestion replaces. */
  prefix: string;
  /** Range in the source the suggestion replaces. */
  from: number;
  to: number;
  /** The field the caret's comparison is about, when known. */
  field?: string;
};

/**
 * What the caret is in the middle of typing. Drives the suggestion list; the
 * `from`/`to` range is what an accepted suggestion replaces.
 */
export function completionAt(input: string, caret: number): Completion {
  const before = input.slice(0, caret);

  const opMatch = before.match(
    /([A-Za-z0-9_.-]+)\s*(==|!=|=gt=|=ge=|=lt=|=le=|=in=|=out=|>=|<=|>|<)\s*([A-Za-z0-9_.:@*+/-]*)$/,
  );
  if (opMatch) {
    return {
      what: "value",
      prefix: opMatch[3],
      from: caret - opMatch[3].length,
      to: caret,
      field: opMatch[1],
    };
  }

  const partialOp = before.match(/([A-Za-z0-9_.-]+)\s*([=!<>]*)$/);
  if (partialOp && partialOp[2].length > 0) {
    return {
      what: "op",
      prefix: partialOp[2],
      from: caret - partialOp[2].length,
      to: caret,
      field: partialOp[1],
    };
  }

  const word = before.match(/[A-Za-z0-9_.-]*$/)?.[0] ?? "";
  const previous = before.slice(0, before.length - word.length).trimEnd();
  const afterComparison = /(==|!=|=gt=|=ge=|=lt=|=le=|=in=|=out=|>=|<=|>|<)$/.test(
    previous,
  );
  if (afterComparison) {
    const field = previous
      .replace(/(==|!=|=gt=|=ge=|=lt=|=le=|=in=|=out=|>=|<=|>|<)$/, "")
      .match(/[A-Za-z0-9_.-]+$/)?.[0];
    return {
      what: "value",
      prefix: word,
      from: caret - word.length,
      to: caret,
      field,
    };
  }

  return { what: "field", prefix: word, from: caret - word.length, to: caret };
}
