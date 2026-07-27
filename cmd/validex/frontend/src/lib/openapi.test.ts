import { describe, expect, it } from "vitest";
import { importedRequestURL } from "./openapi";

describe("OpenAPI request URLs", () => {
  it("uses an absolute server URL from the document", () => {
    expect(importedRequestURL("https://api.example.test/v1/", "/users")).toBe(
      "https://api.example.test/v1/users",
    );
  });

  it("falls back to an editable baseUrl variable", () => {
    expect(importedRequestURL("", "users")).toBe("{{baseUrl}}/users");
    expect(importedRequestURL("https://{region}.example.test", "/users")).toBe(
      "{{baseUrl}}/users",
    );
  });
});
