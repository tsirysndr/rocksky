// Minimal typings for the `bun:test` runner. Tests are executed with
// `bun test` (which ships its own full types); referencing `bun-types`
// program-wide would override globals like `fetch`, so this shim only
// declares what the test files import.
declare module "bun:test" {
  export function describe(label: string, fn: () => void): void;
  export function it(label: string, fn: () => void | Promise<void>): void;
  export function test(label: string, fn: () => void | Promise<void>): void;
  export interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toThrow(expected?: unknown): void;
  }
  export function expect(actual: unknown): Matchers;
}
