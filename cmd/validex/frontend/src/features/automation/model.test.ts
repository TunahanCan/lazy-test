import { describe, expect, it, vi } from "vitest";
import {
  automationOperationID,
  durationLabel,
  parseVariables,
  positiveInteger,
  sampleCollection,
} from "./model";

describe("automation model", () => {
  it("ships a valid collection example with assertions", () => {
    const sample = JSON.parse(sampleCollection) as {
      requests: Array<{ assertions: unknown[] }>;
    };
    expect(sample.requests).toHaveLength(1);
    expect(sample.requests[0].assertions).toHaveLength(3);
  });

  it("accepts only string environment variables", () => {
    expect(parseVariables('{"baseUrl":"http://localhost:8080"}')).toEqual({
      baseUrl: "http://localhost:8080",
    });
    expect(parseVariables("")).toEqual({});
    expect(() => parseVariables("[]")).toThrow(/JSON object/);
    expect(() => parseVariables('{"port":8080}')).toThrow(/string/);
    expect(() => parseVariables('{"bad key":"value"}')).toThrow(/adı.*geçerli değil/);
    expect(() =>
      parseVariables(`{"${"a".repeat(129)}":"value"}`),
    ).toThrow(/adı.*geçerli değil/);
  });

  it("validates bounded positive integers", () => {
    expect(positiveInteger("10", "Timeout", 30)).toBe(10);
    expect(() => positiveInteger("0", "Timeout", 30)).toThrow(/1–30/);
    expect(() => positiveInteger("4.2", "Timeout", 30)).toThrow(/tam sayı/);
  });

  it("formats durations and creates operation IDs", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    expect(automationOperationID("runner")).toBe(
      "runner-00000000-0000-4000-8000-000000000001",
    );
    expect(durationLabel(480)).toBe("480 ms");
    expect(durationLabel(1250)).toBe("1.25 s");
  });
});
