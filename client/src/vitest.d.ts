/* `bun test` aliases imports of "vitest" to its own "bun:test" implementation
   at runtime; this ambient declaration mirrors that aliasing for tsc so the
   test files can keep their vitest imports. */
declare module "vitest" {
  export * from "bun:test";
}
