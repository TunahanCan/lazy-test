import { describe, expect, it } from "vitest";
import { requestNameFromURL } from "./requestName";

describe("requestNameFromURL", () => {
  it("uses the meaningful path segment", () => {
    expect(requestNameFromURL("https://api.example.com/v1/users?active=true")).toBe(
      "Users",
    );
    expect(requestNameFromURL("{{baseUrl}}/v1/users/{id}")).toBe("Users");
    expect(requestNameFromURL("{{baseUrl}}/v12/invoices/42")).toBe("Invoices");
  });

  it("humanizes common path naming styles", () => {
    expect(requestNameFromURL("https://example.com/order-items")).toBe(
      "Order items",
    );
    expect(requestNameFromURL("https://example.com/userProfiles")).toBe(
      "User Profiles",
    );
  });

  it("returns undefined for a blank URL", () => {
    expect(requestNameFromURL("  ")).toBeUndefined();
  });
});
