import { describe, expect, test } from "bun:test";
import { greet } from "@vc-policy-engine/core";

describe("app", () => {
  test("uses the core package", () => {
    expect(greet("app")).toBe("Hello, app");
  });
});
