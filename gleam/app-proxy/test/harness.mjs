import assert from 'node:assert/strict';
import { mock as nodeMock } from 'node:test';
export { test, afterEach, describe } from 'node:test';
export const mock = implementation => nodeMock.fn(implementation);
export const expect = actual => ({
  toBe: expected => assert.equal(actual, expected),
  toEqual: expected => assert.deepEqual(actual, expected),
  toContain: expected => assert.ok(actual.includes(expected)),
  toHaveLength: expected => assert.equal(actual.length, expected),
  toBeNull: () => assert.equal(actual, null),
  toBeUndefined: () => assert.equal(actual, undefined),
  not: {
    toContain: expected => assert.ok(!actual.includes(expected)),
    toHaveBeenCalled: () => assert.equal(actual.mock.callCount(), 0),
  },
});
