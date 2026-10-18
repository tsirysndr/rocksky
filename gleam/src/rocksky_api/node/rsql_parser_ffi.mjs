import { parse as parseRsql } from '@rsql/parser';
import { isLogicNode, isComparisonNode, getSelector } from '@rsql/ast';
import { Ok, Error as GError, toList } from '../../gleam.mjs';
import { Logic, Comparison } from './rsql_parser.mjs';
const convert = node => {
  if (isLogicNode(node)) return new Logic(node.operator, convert(node.left), convert(node.right));
  if (isComparisonNode(node)) return new Comparison(getSelector(node), node.operator, toList(Array.isArray(node.right.value) ? node.right.value : [node.right.value]));
  throw new Error('unsupported expression');
};
export const parse = filter => { try { return new Ok(convert(parseRsql(filter))); } catch(e) { return new GError(`Invalid RSQL filter: ${e.message}`); } };
export const number = value => Number.isFinite(Number(value)) ? new Ok(Number(value)) : new GError(value);
export const date = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? new GError(value) : new Ok(date); };
