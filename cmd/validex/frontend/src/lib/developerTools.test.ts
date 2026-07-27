import { describe, expect, it } from "vitest";
import {
  analyzeJWT,
  analyzeSpringError,
  compareJSON,
  formatJSON,
  inferJSONSchema,
  javaDTOToJSONExample,
  minifyJSON,
  queryJSONPath,
  sortJSON,
} from "./developerTools";

function base64url(value: unknown) {
  return btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

describe("developer tools", () => {
  it("formats, minifies and recursively sorts JSON", () => {
    const input = '{"z":{"b":1,"a":2},"a":true}';
    expect(formatJSON(input)).toContain('\n  "z"');
    expect(minifyJSON(formatJSON(input))).toBe(input);
    expect(sortJSON(input)).toBe(
      '{\n  "a": true,\n  "z": {\n    "a": 2,\n    "b": 1\n  }\n}',
    );
  });

  it("compares JSON structure and ignores selected paths", () => {
    const differences = compareJSON(
      '{"id":"a","user":{"name":"Ada"},"items":[1]}',
      '{"id":"b","user":{"name":"Grace","active":true},"items":["1",2]}',
      ["$.id"],
    );
    expect(differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.items[0]", kind: "type" }),
        expect.objectContaining({ path: "$.items[1]", kind: "added" }),
        expect.objectContaining({
          path: "$.user.active",
          kind: "added",
        }),
        expect.objectContaining({
          path: "$.user.name",
          kind: "changed",
        }),
      ]),
    );
    expect(differences.some((item) => item.path === "$.id")).toBe(false);
  });

  it("queries a safe JSONPath subset", () => {
    expect(
      queryJSONPath('{"users":[{"name":"Ada"}]}', "$.users[0].name"),
    ).toBe("Ada");
    expect(() => queryJSONPath("{}", "$..name")).toThrow(
      "desteklenmiyor",
    );
  });

  it("recognizes ProblemDetail and Bean Validation responses", () => {
    const result = analyzeSpringError(
      JSON.stringify({
        type: "https://example.test/validation",
        title: "Validation failed",
        status: 400,
        detail: "Request has invalid fields",
        errors: [
          {
            field: "email",
            defaultMessage: "must be a well-formed email address",
            rejectedValue: "broken",
          },
        ],
      }),
      400,
      { "X-Trace-ID": ["trace-42"] },
    );
    expect(result.category).toBe("problem-detail");
    expect(result.fieldErrors[0]).toMatchObject({
      field: "email",
      rejectedValue: "broken",
    });
    expect(result.traceId).toBe("trace-42");
  });

  it("recognizes ProblemDetail when optional type and instance are omitted", () => {
    const result = analyzeSpringError(
      JSON.stringify({
        title: "Bad Request",
        status: 400,
        detail: "Malformed request payload",
      }),
      400,
    );

    expect(result).toMatchObject({
      recognized: true,
      category: "problem-detail",
      title: "Bad Request",
      detail: "Malformed request payload",
      status: 400,
    });
  });

  it("uses only valid W3C traceparent IDs and falls back to request headers", () => {
    const valid = analyzeSpringError("{}", 500, {
      traceparent: [
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      ],
      "X-Trace-ID": ["trace-fallback"],
    });
    const invalid = analyzeSpringError("{}", 500, {
      traceparent: [
        "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
      ],
      "X-Request-ID": ["request-fallback"],
    });

    expect(valid.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(invalid.traceId).toBe("request-fallback");
  });

  it("decodes JWT claims without claiming signature verification", () => {
    const token = [
      base64url({ alg: "RS256", typ: "JWT" }),
      base64url({
        sub: "user-1",
        iss: "https://issuer.test",
        aud: ["validex"],
        exp: 2_000,
        scope: "orders:read orders:write",
        realm_access: { roles: ["admin"] },
      }),
      "signature",
    ].join(".");
    const result = analyzeJWT(token, 1_000_000);
    expect(result.active).toBe(true);
    expect(result.roles).toEqual(["admin"]);
    expect(result.scopes).toEqual(["orders:read", "orders:write"]);
    expect(result.signaturePresent).toBe(true);
  });

  it("infers a JSON Schema suitable for mock setup", () => {
    const schema = JSON.parse(
      inferJSONSchema('{"id":42,"tags":["api"],"active":true}'),
    );
    expect(schema.properties.id.type).toBe("integer");
    expect(schema.properties.tags.items.type).toBe("string");
    expect(schema.required).toEqual(["id", "tags", "active"]);
  });

  it("creates a mock JSON example from nested Java response records", () => {
    const example = JSON.parse(
      javaDTOToJSONExample(`
        public record OrderResponse(
          UUID id,
          @JsonProperty("created_at") Instant createdAt,
          List<OrderLineResponse> lines,
          OrderStatus status
        ) {}

        record OrderLineResponse(String sku, BigDecimal price) {}
        enum OrderStatus { CREATED, SHIPPED }
      `),
    );
    expect(example).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      created_at: "2026-01-01T12:00:00Z",
      lines: [{ sku: "example", price: 0 }],
      status: "CREATED",
    });
  });

  it("reads Java class fields without generating source code", () => {
    const example = JSON.parse(
      javaDTOToJSONExample(`
        @Value
        public class UserResponse {
          private static final long serialVersionUID = 1L;
          private final long id;
          @JsonProperty("display_name")
          private String displayName;
          @JsonIgnore
          private String internalNote;
          private Optional<Boolean> active;
        }
      `),
    );
    expect(example).toEqual({
      id: 0,
      display_name: "example",
      active: false,
    });
  });
});
