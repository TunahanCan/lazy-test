import { describe, expect, it } from "vitest";
import {
  missingVariables,
  normalizeRequestURL,
  resolveVariableReferences,
  requestSchema,
} from "./schemas";

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

  it("normalizes common schemeless URLs", () => {
    expect(normalizeRequestURL("localhost:8080/health")).toBe(
      "http://localhost:8080/health",
    );
    expect(normalizeRequestURL("10.20.30.40:8081/api")).toBe(
      "http://10.20.30.40:8081/api",
    );
    expect(normalizeRequestURL("api.example.com/users")).toBe(
      "https://api.example.com/users",
    );
    expect(normalizeRequestURL("[fd00::1]:8080/health")).toBe(
      "http://[fd00::1]:8080/health",
    );
    expect(normalizeRequestURL("127.attacker.example/users")).toBe(
      "https://127.attacker.example/users",
    );
    expect(normalizeRequestURL("10.evil.example/users")).toBe(
      "https://10.evil.example/users",
    );
  });

  it("keeps variable-based and explicit URLs intact", () => {
    expect(normalizeRequestURL("{{baseUrl}}/v1/users")).toBe(
      "{{baseUrl}}/v1/users",
    );
    expect(normalizeRequestURL("http://example.test/users")).toBe(
      "http://example.test/users",
    );
  });

  it("reports unresolved secret variables", () => {
    expect(
      missingVariables("{{baseUrl}}/{{token}}", {
        baseUrl: "https://example.test",
        token: "••••••••••••",
      }),
    ).toEqual(["token"]);
  });

  it("resolves known references without removing unknown values", () => {
    expect(
      resolveVariableReferences(
        "{{baseUrl}}/users/{{id}}/{{unknown}}",
        {
          baseUrl: "https://example.test",
          id: "42",
        },
      ),
    ).toBe("https://example.test/users/42/{{unknown}}");
  });
});
