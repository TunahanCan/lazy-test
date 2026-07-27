import { describe, expect, it } from "vitest";
import {
  missingVariables,
  resolveVariableReferences,
  requestSchema,
  requestURLValidationMessage,
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

  it("requires an explicit HTTP or HTTPS scheme without transforming input", () => {
    for (const value of [
      "localhost:8080/health",
      "10.20.30.40:8081/api",
      "api.example.com/users",
      "//api.example.com/users",
    ]) {
      expect(requestURLValidationMessage(value)).toBe(
        "URL açıkça http:// veya https:// ile başlamalı.",
      );
      expect(
        requestSchema.safeParse({
          method: "GET",
          url: value,
          body: "",
          headers: [],
          timeoutMs: 30_000,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects URL fragments and embedded user credentials", () => {
    expect(
      requestURLValidationMessage("https://example.test/users#details"),
    ).toBe("URL fragment (#…) içeremez.");
    expect(
      requestURLValidationMessage("https://user:secret@example.test/users"),
    ).toBe(
      "URL kullanıcı bilgisi içeremez. Kimlik doğrulamayı Headers üzerinden yönetin.",
    );
    expect(requestURLValidationMessage("https://example.test/users#")).toBe(
      "URL fragment (#…) içeremez.",
    );
    expect(requestURLValidationMessage(" https://example.test/users")).toBe(
      "URL başında veya sonunda boşluk içeremez.",
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
