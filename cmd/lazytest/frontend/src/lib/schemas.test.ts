import { describe, expect, it } from "vitest";
import { missingVariables, requestSchema } from "./schemas";

describe("request schema", () => {
  it("accepts variable-based URLs", () => {
    expect(
      requestSchema.safeParse({
        method: "GET",
        url: "{{baseUrl}}/v1/users",
        body: "",
        headers: [],
        timeoutMs: 30_000,
      }).success,
    ).toBe(true);
  });

  it("rejects malformed URLs", () => {
    expect(
      requestSchema.safeParse({
        method: "GET",
        url: "not a URL",
        body: "",
        headers: [],
        timeoutMs: 30_000,
      }).success,
    ).toBe(false);
  });

  it("reports unresolved secret variables", () => {
    expect(
      missingVariables("{{baseUrl}}/{{token}}", {
        baseUrl: "https://example.test",
        token: "••••••••",
      }),
    ).toEqual(["token"]);
  });
});
