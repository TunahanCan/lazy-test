import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVED_COLLECTION_RUNNER_VERSION,
  savedCollectionRunnerDefinition,
} from "../.typescript-build/esm/features/automation/savedCollectionRunner.js";

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

test("saved collection adapter preserves request and header execution order", () => {
  const collection = deepFreeze({
    id: "collection-payments",
    name: "Payments API",
  });
  const requests = deepFreeze([
    {
      id: "request-create",
      collectionId: collection.id,
      literalValues: true,
      name: "Create payment",
      method: "POST",
      url: "https://api.example.test/payments",
      headers: [
        {
          id: "debug-one",
          enabled: true,
          key: "X-Debug",
          value: "one",
          description: "First value",
          source: "Manual",
        },
        {
          id: "debug-two",
          enabled: true,
          key: "X-Debug",
          value: "two",
        },
        {
          id: "disabled",
          enabled: false,
          key: "Authorization",
          value: "",
          source: "Environment",
        },
      ],
      body: '{"template":"{{literal-value}}"}',
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      sortOrder: 0,
    },
    {
      id: "request-status",
      collectionId: collection.id,
      name: "Payment status",
      method: "GET",
      url: "{{baseUrl}}/payments/42",
      headers: [],
      body: "",
      createdAt: "2026-07-28T10:01:00.000Z",
      updatedAt: "2026-07-28T10:01:00.000Z",
      sortOrder: 1,
    },
  ]);

  const definition = JSON.parse(
    savedCollectionRunnerDefinition(collection, requests),
  );

  assert.equal(definition.version, SAVED_COLLECTION_RUNNER_VERSION);
  assert.equal(definition.name, collection.name);
  assert.deepEqual(
    definition.requests.map((request) => request.id),
    ["request-create", "request-status"],
  );
  assert.deepEqual(definition.requests[0].headers, [
    { enabled: true, key: "X-Debug", value: "one" },
    { enabled: true, key: "X-Debug", value: "two" },
    { enabled: false, key: "Authorization", value: "" },
  ]);
  assert.equal(definition.requests[0].literalValues, true);
  assert.equal(definition.requests[1].literalValues, false);
  assert.equal(definition.requests[0].body, '{"template":"{{literal-value}}"}');
});

test("saved collection adapter excludes foreign requests and runtime variables", () => {
  const collection = {
    id: "collection-orders",
    name: "Orders API",
  };
  const requests = [
    {
      id: "request-orders",
      collectionId: collection.id,
      name: "List orders",
      method: "GET",
      url: "{{baseUrl}}/orders",
      headers: [
        {
          id: "token-reference",
          enabled: true,
          key: "Authorization",
          value: "Bearer {{token}}",
        },
      ],
      body: "",
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T10:00:00.000Z",
      sortOrder: 0,
    },
    {
      id: "request-foreign",
      collectionId: "collection-private",
      name: "Foreign request",
      method: "GET",
      url: "https://private.example.test/runtime-secret",
      headers: [],
      body: "",
      createdAt: "2026-07-28T10:01:00.000Z",
      updatedAt: "2026-07-28T10:01:00.000Z",
      sortOrder: 0,
    },
  ];
  const before = structuredClone(requests);

  const serialized = savedCollectionRunnerDefinition(collection, requests);
  const definition = JSON.parse(serialized);

  assert.deepEqual(requests, before);
  assert.equal(definition.requests.length, 1);
  assert.equal(definition.requests[0].url, "{{baseUrl}}/orders");
  assert.equal("variables" in definition, false);
  assert.equal("variables" in definition.requests[0], false);
  assert.equal(serialized.includes("runtime-secret"), false);
});
