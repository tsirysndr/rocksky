import { isComparisonNode, isLogicNode } from "@rsql/ast";
import { parse } from "@rsql/parser";

// Re-tag the @rsql/ast tree so PureScript can decode it without knowing
// the SelectorNode/ValueNode wrappers.
const convert = (node) => {
  if (isLogicNode(node)) {
    const op = node.operator === "," || node.operator === "or" ? "or" : "and";
    return { tag: "logic", operator: op, left: convert(node.left), right: convert(node.right) };
  }
  if (isComparisonNode(node)) {
    const v = node.right.value;
    return {
      tag: "comparison",
      selector: node.left.selector,
      operator: node.operator,
      multi: Array.isArray(v),
      values: Array.isArray(v) ? v : [v],
    };
  }
  throw new Error("Invalid RSQL filter: unsupported expression");
};

export const parseImpl = (left) => (right) => (input) => {
  try {
    return right(convert(parse(input)));
  } catch (e) {
    return left(e instanceof Error ? e.message : String(e));
  }
};
export const rawTag = (n) => n.tag;
export const rawSelector = (n) => n.selector;
export const rawOperator = (n) => n.operator;
export const rawIsMulti = (n) => n.multi;
export const rawValues = (n) => n.values;
export const rawLeft = (n) => n.left;
export const rawRight = (n) => n.right;
