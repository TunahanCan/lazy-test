import { describe, expect, it } from "vitest";
import {
  importedEndpointTabID,
  importedRequestURL,
  requestURLMatchesOpenAPIPath,
} from "./openapi";

describe("OpenAPI request URLs", () => {
  it("gives imported operations a stable tab identity", () => {
    expect(importedEndpointTabID("orders", "get-order")).toBe(
      "openapi:orders:get-order",
    );
  });

  it("uses an absolute server URL from the document", () => {
    expect(importedRequestURL("https://api.example.test/v1/", "/users")).toBe(
      "https://api.example.test/v1/users",
    );
  });

  it("falls back to an editable baseUrl variable", () => {
    expect(importedRequestURL("", "users")).toBe("{{baseUrl}}/users");
  });

  it("keeps relative and templated OpenAPI server paths editable", () => {
    expect(importedRequestURL("/api/v1/", "/users/{id}")).toBe(
      "{{baseUrl}}/api/v1/users/{{id}}",
    );
    expect(
      importedRequestURL(
        "https://{region}.example.test/api/{version}",
        "/users/{id}",
      ),
    ).toBe(
      "https://{{region}}.example.test/api/{{version}}/users/{{id}}",
    );
    expect(importedRequestURL("{{baseUrl}}/gateway", "/users/{id}")).toBe(
      "{{baseUrl}}/gateway/users/{{id}}",
    );
  });

  it("keeps contract metadata only for the imported operation path", () => {
    expect(
      requestURLMatchesOpenAPIPath(
        "https://api.example.test/v1/orders/42?expand=true",
        "/orders/{id}",
      ),
    ).toBe(true);
    expect(
      requestURLMatchesOpenAPIPath("{{baseUrl}}/orders/{{id}}", "/orders/{id}"),
    ).toBe(true);
    expect(
      requestURLMatchesOpenAPIPath(
        "https://api.example.test/v1/customers/42",
        "/orders/{id}",
      ),
    ).toBe(false);
  });
});
