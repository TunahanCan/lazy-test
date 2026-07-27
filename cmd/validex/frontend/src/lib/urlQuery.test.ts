import { describe, expect, it } from "vitest";
import {
  addURLQueryRow,
  parseURLQuery,
  removeURLQueryRow,
  updateURLQueryRow,
} from "./urlQuery";

describe("raw URL query helpers", () => {
  it("derives ordered rows while preserving duplicates and raw values", () => {
    const url =
      "https://api.example.test/search?tag=java&tag=spring%20boot&empty=&flag&scope={{scope}}#results";

    expect(parseURLQuery(url)).toEqual([
      {
        id: "query-param-0",
        index: 0,
        key: "tag",
        value: "java",
        hasEquals: true,
        rawKey: "tag",
        rawValue: "java",
        rawSegment: "tag=java",
      },
      {
        id: "query-param-1",
        index: 1,
        key: "tag",
        value: "spring boot",
        hasEquals: true,
        rawKey: "tag",
        rawValue: "spring%20boot",
        rawSegment: "tag=spring%20boot",
      },
      {
        id: "query-param-2",
        index: 2,
        key: "empty",
        value: "",
        hasEquals: true,
        rawKey: "empty",
        rawValue: "",
        rawSegment: "empty=",
      },
      {
        id: "query-param-3",
        index: 3,
        key: "flag",
        value: "",
        hasEquals: false,
        rawKey: "flag",
        rawValue: "",
        rawSegment: "flag",
      },
      {
        id: "query-param-4",
        index: 4,
        key: "scope",
        value: "{{scope}}",
        hasEquals: true,
        rawKey: "scope",
        rawValue: "{{scope}}",
        rawSegment: "scope={{scope}}",
      },
    ]);
  });

  it("decodes display values safely without throwing on malformed escapes", () => {
    const rows = parseURLQuery(
      "https://api.example.test/search?phrase=hello+world&bad=%E0%A4%A&ok=%41",
    );

    expect(rows.map(({ value }) => value)).toEqual([
      "hello world",
      "%E0%A4%A",
      "A",
    ]);
  });

  it("returns the original URL when a row is left untouched", () => {
    const url =
      "{{baseUrl}}/orders?encoded=a%2Fb&space=a+b&token={{token}}#summary";

    expect(updateURLQueryRow(url, 1, {})).toBe(url);
  });

  it("updates only the selected component and keeps other raw encoding", () => {
    const url =
      "https://api.example.test/search?tag=spring%20boot&tag={{scope}}&q=a+b#results";

    expect(
      updateURLQueryRow(url, 0, { value: "Spring & Java" }),
    ).toBe(
      "https://api.example.test/search?tag=Spring%20%26%20Java&tag={{scope}}&q=a+b#results",
    );
    expect(updateURLQueryRow(url, 1, { key: "role name" })).toBe(
      "https://api.example.test/search?tag=spring%20boot&role%20name={{scope}}&q=a+b#results",
    );
  });

  it("preserves variable templates while encoding intentionally edited text", () => {
    const url = "https://api.example.test/search?filter=current#result";

    expect(
      updateURLQueryRow(url, 0, {
        value: "owner={{user.id}} & scope={{ scope-name }}",
      }),
    ).toBe(
      "https://api.example.test/search?filter=owner%3D{{user.id}}%20%26%20scope%3D{{ scope-name }}#result",
    );
  });

  it("adds rows before the fragment and keeps the existing query byte-for-byte", () => {
    expect(
      addURLQueryRow("{{baseUrl}}/orders#summary", {
        key: "owner",
        value: "{{user}}",
      }),
    ).toBe("{{baseUrl}}/orders?owner={{user}}#summary");

    expect(
      addURLQueryRow(
        "https://api.example.test/search?q=spring+boot#results",
        { key: "tag name", value: "JVM & GC" },
      ),
    ).toBe(
      "https://api.example.test/search?q=spring+boot&tag%20name=JVM%20%26%20GC#results",
    );
  });

  it("removes a duplicate by index without touching path or fragment", () => {
    const url =
      "https://api.example.test/search?tag=java&tag=spring%20boot&empty=#results";

    expect(removeURLQueryRow(url, 1)).toBe(
      "https://api.example.test/search?tag=java&empty=#results",
    );
    expect(removeURLQueryRow("relative/path?only=value#fragment", 0)).toBe(
      "relative/path#fragment",
    );
  });

  it("ignores query-looking text in fragments and invalid row indexes", () => {
    const url = "https://api.example.test/search#section?not=a-query";

    expect(parseURLQuery(url)).toEqual([]);
    expect(updateURLQueryRow(url, 0, { value: "ignored" })).toBe(url);
    expect(removeURLQueryRow(url, 0)).toBe(url);
  });
});
