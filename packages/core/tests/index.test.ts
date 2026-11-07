import { describe, expect, test } from "bun:test";
import { greet } from "../src/index.ts";

describe("greet", () => {
  test("returns a greeting", () => {
    expect(greet("world")).toBe("Hello, world");
  });
});
