import assert from "node:assert/strict";
import test from "node:test";

const {
  POSTMAN_COLLECTION_V21_SCHEMA,
  parsePostmanCollection,
  serializePostmanCollection,
} = await import(
  "../.typescript-build/esm/features/collections/postmanTransfer.js"
);

test("exports a portable Postman v2.1 collection without literal secrets", () => {
  const exported = JSON.parse(
    serializePostmanCollection(
      {
        id: "collection-id",
        name: "Payments API",
        createdAt: "2026-07-29T08:00:00.000Z",
        updatedAt: "2026-07-29T08:00:00.000Z",
        sortOrder: 0,
      },
      [
        {
          id: "second",
          collectionId: "collection-id",
          name: "Create payment",
          method: "POST",
          url: "{{baseUrl}}/payments",
          headers: [
            {
              id: "authorization",
              enabled: true,
              key: "Authorization",
              value: "Bearer literal-secret",
            },
            {
              id: "api-key-reference",
              enabled: true,
              key: "X-Api-Key",
              value: "{{apiKey}}",
            },
            {
              id: "trace",
              enabled: false,
              key: "X-Trace",
              value: "trace-value",
              description: "Trace context",
            },
          ],
          body: '{"amount":42}',
          createdAt: "2026-07-29T08:00:01.000Z",
          updatedAt: "2026-07-29T08:00:01.000Z",
          sortOrder: 1,
        },
        {
          id: "first",
          collectionId: "collection-id",
          name: "List payments",
          method: "GET",
          url: "{{baseUrl}}/payments",
          headers: [],
          body: "",
          createdAt: "2026-07-29T08:00:00.000Z",
          updatedAt: "2026-07-29T08:00:00.000Z",
          sortOrder: 0,
        },
      ],
    ),
  );

  assert.equal(exported.info.schema, POSTMAN_COLLECTION_V21_SCHEMA);
  assert.equal(exported.info.name, "Payments API");
  assert.deepEqual(
    exported.item.map((item) => item.name),
    ["List payments", "Create payment"],
  );
  assert.equal(exported.item[1].request.body.mode, "raw");
  assert.equal(exported.item[1].request.body.raw, '{"amount":42}');
  assert.deepEqual(exported.item[1].request.header, [
    {
      key: "Authorization",
      value: "",
      type: "text",
      disabled: true,
    },
    {
      key: "X-Api-Key",
      value: "{{apiKey}}",
      type: "text",
      disabled: false,
    },
    {
      key: "X-Trace",
      value: "trace-value",
      type: "text",
      disabled: true,
      description: "Trace context",
    },
  ]);
});

test("imports nested Postman v2.1 requests and reports unsupported features", () => {
  const parsed = parsePostmanCollection({
    info: {
      name: "Partner API",
      schema: POSTMAN_COLLECTION_V21_SCHEMA,
    },
    variable: [{ key: "baseUrl", value: "https://example.test" }],
    event: [{ listen: "prerequest", script: { exec: ["set();"] } }],
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{accessToken}}" }],
    },
    item: [
      {
        name: "Users",
        item: [
          {
            name: "Find user",
            request: {
              method: "get",
              url: {
                raw:
                  "https://api.example.test/users/:userId?expand=profile&ignored=yes",
                protocol: "https",
                host: ["api", "example", "test"],
                path: ["users", ":userId"],
                variable: [{ key: "userId", value: "{{userId}}" }],
                query: [
                  { key: "expand", value: "profile" },
                  { key: "ignored", value: "yes", disabled: true },
                ],
              },
              header: [
                {
                  key: "Accept",
                  value: "application/json",
                  description: {
                    content: "Accepted representation",
                  },
                },
              ],
            },
            response: [{ name: "Success" }],
          },
        ],
      },
      {
        name: "Upload avatar",
        request: {
          method: "POST",
          url: {
            protocol: "https",
            host: ["api", "example", "test"],
            port: "8443",
            path: ["avatar", { type: "path", value: "current" }],
            hash: "preview",
          },
          body: {
            mode: "formdata",
            formdata: [{ key: "avatar", type: "file" }],
          },
        },
      },
    ],
  });

  assert.deepEqual(parsed.batch, {
    collections: [
      {
        name: "Partner API",
        requests: [
          {
            name: "Users / Find user",
            method: "GET",
            url: "https://api.example.test/users/{{userId}}?expand=profile",
            headers: [
              {
                enabled: true,
                key: "Accept",
                value: "application/json",
                description: "Accepted representation",
              },
              {
                enabled: true,
                key: "Authorization",
                value: "Bearer {{accessToken}}",
                sensitive: true,
              },
            ],
            body: "",
          },
          {
            name: "Upload avatar",
            method: "POST",
            url: "https://api.example.test:8443/avatar/current#preview",
            headers: [
              {
                enabled: true,
                key: "Authorization",
                value: "Bearer {{accessToken}}",
                sensitive: true,
              },
            ],
            body: "",
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    parsed.warnings.map((warning) => warning.code),
    [
      "variables_ignored",
      "scripts_ignored",
      "folder_hierarchy_flattened",
      "examples_ignored",
      "body_ignored",
    ],
  );
});

test("supports string requests and headers while keeping disabled bodies inactive", () => {
  const parsed = parsePostmanCollection({
    info: {
      name: "Schema variants",
      schema: POSTMAN_COLLECTION_V21_SCHEMA,
    },
    item: [
      {
        name: "Health",
        request: "https://api.example.test/health",
      },
      {
        name: "Create order",
        variable: [{ key: "orderId", value: "42" }],
        request: {
          method: "POST",
          url: "https://api.example.test/orders/{{orderId}}",
          header:
            "Accept: application/json\r\nX-Client: postman\r\ninvalid",
          variable: [{ key: "requestValue", value: "ignored" }],
          proxy: {
            host: "proxy.example.test",
            port: 8080,
          },
          auth: {
            type: "apikey",
            apikey: [
              {
                key: "key",
                value: "Ocp-Apim-Subscription-Key",
              },
              {
                key: "value",
                value: "literal-subscription-secret",
              },
              { key: "in", value: "header" },
            ],
          },
          body: {
            mode: "raw",
            raw: "DO NOT SEND",
            disabled: true,
          },
        },
      },
    ],
  });

  assert.deepEqual(parsed.batch, {
    collections: [
      {
        name: "Schema variants",
        requests: [
          {
            name: "Health",
            method: "GET",
            url: "https://api.example.test/health",
            headers: [],
            body: "",
          },
          {
            name: "Create order",
            method: "POST",
            url: "https://api.example.test/orders/{{orderId}}",
            headers: [
              {
                enabled: true,
                key: "Accept",
                value: "application/json",
              },
              {
                enabled: true,
                key: "X-Client",
                value: "postman",
              },
              {
                enabled: true,
                key: "Ocp-Apim-Subscription-Key",
                value: "literal-subscription-secret",
                sensitive: true,
              },
            ],
            body: "",
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    parsed.warnings.map(({ code, count }) => ({ code, count })),
    [
      { code: "variables_ignored", count: 2 },
      { code: "transport_ignored", count: 1 },
    ],
  );
});

test("rejects invalid JSON and non-v2.1 collection documents", () => {
  assert.throws(
    () => parsePostmanCollection("{"),
    /not valid JSON/,
  );
  assert.throws(
    () =>
      parsePostmanCollection({
        info: {
          name: "Old collection",
          schema:
            "https://schema.getpostman.com/json/collection/v2.0.0/collection.json",
        },
        item: [],
      }),
    /not a Postman Collection v2\.1/,
  );
});
