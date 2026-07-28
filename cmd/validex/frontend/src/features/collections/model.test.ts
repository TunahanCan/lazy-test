import { describe, expect, it } from "vitest";
import {
  COLLECTION_NAME_LENGTH_LIMITS,
  SAVED_REQUEST_NAME_LENGTH_LIMITS,
  bySortOrder,
  createOpenRequestSnapshot,
  normalizedLibraryName,
  type SavedRequest,
} from "./model";

const savedRequest: SavedRequest = {
  id: "request-1",
  collectionId: "collection-1",
  name: "List users",
  method: "GET",
  url: "https://example.test/users",
  headers: [
    {
      id: "accept",
      enabled: true,
      key: "Accept",
      value: "application/json",
    },
  ],
  body: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sortOrder: 0,
};

describe("collection model", () => {
  it("normalizes names within the named length limits", () => {
    expect(
      normalizedLibraryName(
        "  Platform   API  ",
        COLLECTION_NAME_LENGTH_LIMITS,
      ),
    ).toBe("Platform API");
    expect(
      normalizedLibraryName(" ", COLLECTION_NAME_LENGTH_LIMITS),
    ).toBeUndefined();
    expect(
      normalizedLibraryName(
        "r".repeat(SAVED_REQUEST_NAME_LENGTH_LIMITS[1] + 1),
        SAVED_REQUEST_NAME_LENGTH_LIMITS,
      ),
    ).toBeUndefined();
  });

  it("creates an isolated tab snapshot without runtime state", () => {
    const snapshot = createOpenRequestSnapshot(savedRequest);

    expect(snapshot).toEqual({
      savedRequestId: "request-1",
      collectionId: "collection-1",
      name: "List users",
      method: "GET",
      url: "https://example.test/users",
      headers: savedRequest.headers,
      body: "",
    });
    expect(snapshot.headers).not.toBe(savedRequest.headers);
    expect(snapshot.headers[0]).not.toBe(savedRequest.headers[0]);
    expect(snapshot).not.toHaveProperty("response");
    expect(snapshot).not.toHaveProperty("running");
    expect(snapshot).not.toHaveProperty("error");
  });

  it("orders equal positions deterministically by creation time", () => {
    const later = {
      sortOrder: 3,
      createdAt: "2026-01-02T00:00:00.000Z",
    };
    const earlier = {
      sortOrder: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    expect([later, earlier].sort(bySortOrder)).toEqual([earlier, later]);
  });
});
