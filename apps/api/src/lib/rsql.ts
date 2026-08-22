import { InvalidRequestError } from "@atproto/xrpc-server";
import {
  type ComparisonNode,
  type ExpressionNode,
  getMultiValue,
  getSelector,
  getSingleValue,
  isComparisonNode,
  isLogicNode,
} from "@rsql/ast";
import { parse } from "@rsql/parser";
import {
  and,
  type Column,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notIlike,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

export type RsqlFieldType = "string" | "number" | "date" | "string[]";

export interface RsqlField {
  column: Column;
  type?: RsqlFieldType;
}

/**
 * Allowlist of RSQL selectors → Drizzle columns for one endpoint. Selectors
 * absent from the map are rejected, so user input can never reach a column
 * (or table) that wasn't explicitly exposed.
 */
export type RsqlFieldMap = Record<string, Column | RsqlField>;

export class RsqlFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RsqlFilterError";
  }
}

/**
 * Compiles an RSQL expression (https://github.com/jirutka/rsql-parser) into a
 * parameterized Drizzle SQL condition.
 *
 * Supported operators: `==`, `!=`, `<`/`=lt=`, `<=`/`=le=`, `>`/`=gt=`,
 * `>=`/`=ge=`, `=in=`, `=out=`, combined with `;`/`and`, `,`/`or` and
 * parentheses. String equality supports `*` wildcards (case-insensitive
 * LIKE) and the bare literal `null` (IS NULL / IS NOT NULL). On `string[]`
 * columns `==`/`!=` compile to array containment and `=in=`/`=out=` to
 * array overlap.
 */
export function compileRsqlFilter(filter: string, fields: RsqlFieldMap): SQL {
  let ast: ExpressionNode;
  try {
    ast = parse(filter);
  } catch (err) {
    throw new RsqlFilterError(
      `Invalid RSQL filter: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return compileNode(ast, fields);
}

/**
 * Same as `compileRsqlFilter`, but tailored to XRPC handlers: skips
 * empty/absent filters and rethrows compile errors as `InvalidRequestError`
 * so clients get a 400 instead of a masked empty result.
 */
export function compileRsqlFilterParam(
  filter: string | undefined,
  fields: RsqlFieldMap,
): SQL | undefined {
  if (!filter?.trim()) {
    return undefined;
  }
  try {
    return compileRsqlFilter(filter, fields);
  } catch (err) {
    throw new InvalidRequestError(
      err instanceof Error ? err.message : String(err),
      "InvalidFilter",
    );
  }
}

const compileNode = (node: ExpressionNode, fields: RsqlFieldMap): SQL => {
  if (isLogicNode(node)) {
    const left = compileNode(node.left, fields);
    const right = compileNode(node.right, fields);
    const combined =
      node.operator === ";" || node.operator === "and"
        ? and(left, right)
        : or(left, right);
    return combined as SQL;
  }
  if (isComparisonNode(node)) {
    return compileComparison(node, fields);
  }
  throw new RsqlFilterError("Invalid RSQL filter: unsupported expression");
};

const compileComparison = (node: ComparisonNode, fields: RsqlFieldMap): SQL => {
  const selector = getSelector(node);
  const field = fields[selector];
  if (!field) {
    throw new RsqlFilterError(
      `Unknown filter field "${selector}". Allowed fields: ${Object.keys(fields).sort().join(", ")}`,
    );
  }
  const column = "column" in field ? field.column : (field as Column);
  const type: RsqlFieldType =
    "column" in field ? ((field as RsqlField).type ?? "string") : "string";

  switch (node.operator) {
    case "==":
      return compileEquality(node, selector, column, type, false);
    case "!=":
      return compileEquality(node, selector, column, type, true);
    case ">":
    case "=gt=":
      return gt(column, coerceValue(getSingleValue(node), type, selector));
    case ">=":
    case "=ge=":
      return gte(column, coerceValue(getSingleValue(node), type, selector));
    case "<":
    case "=lt=":
      return lt(column, coerceValue(getSingleValue(node), type, selector));
    case "<=":
    case "=le=":
      return lte(column, coerceValue(getSingleValue(node), type, selector));
    case "=in=":
    case "=out=": {
      const values = getMultiValue(node);
      const negated = node.operator === "=out=";
      if (type === "string[]") {
        const overlaps = sql`${column} && ARRAY[${sql.join(
          values.map((v) => sql`${v}`),
          sql`, `,
        )}]::text[]`;
        return negated ? not(overlaps) : overlaps;
      }
      const coerced = values.map((v) => coerceValue(v, type, selector));
      return negated ? notInArray(column, coerced) : inArray(column, coerced);
    }
    default:
      throw new RsqlFilterError(
        `Unsupported filter operator "${node.operator}" on field "${selector}"`,
      );
  }
};

const compileEquality = (
  node: ComparisonNode,
  selector: string,
  column: Column,
  type: RsqlFieldType,
  negated: boolean,
): SQL => {
  const raw = getSingleValue(node);
  if (raw === "null") {
    return negated ? isNotNull(column) : isNull(column);
  }
  if (type === "string[]") {
    const contains = sql`${column} @> ARRAY[${raw}]::text[]`;
    return negated ? not(contains) : contains;
  }
  if (type === "string" && raw.includes("*")) {
    const pattern = raw.replace(/([\\%_])/g, "\\$1").replace(/\*/g, "%");
    return negated ? notIlike(column, pattern) : ilike(column, pattern);
  }
  const value = coerceValue(raw, type, selector);
  return negated ? ne(column, value) : eq(column, value);
};

const coerceValue = (
  value: string,
  type: RsqlFieldType,
  selector: string,
): string | number | Date => {
  switch (type) {
    case "number": {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new RsqlFilterError(
          `Field "${selector}" expects a number, got "${value}"`,
        );
      }
      return num;
    }
    case "date": {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new RsqlFilterError(
          `Field "${selector}" expects a date (e.g. 2025-01-01 or ISO datetime), got "${value}"`,
        );
      }
      return date;
    }
    case "string[]":
      throw new RsqlFilterError(
        `Field "${selector}" is an array and only supports ==, !=, =in= and =out=`,
      );
    default:
      return value;
  }
};
