import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JSONLab } from "./JSONLab";

describe("JSONLab", () => {
  afterEach(cleanup);

  it("formats, minifies and recursively sorts JSON in the Formatter", () => {
    render(<JSONLab />);

    const input = screen.getByRole("textbox", { name: "JSON input" });
    fireEvent.change(input, {
      target: { value: '{"z":{"b":1,"a":2},"a":true}' },
    });

    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    expect(screen.getByRole("status")).toHaveTextContent("JSON formatlandı.");
    expect(screen.getByRole("textbox", { name: "JSON işlem sonucu" })).toHaveValue(
      '{\n  "z": {\n    "b": 1,\n    "a": 2\n  },\n  "a": true\n}',
    );

    fireEvent.click(screen.getByRole("button", { name: "Minify" }));
    expect(screen.getByRole("status")).toHaveTextContent("JSON küçültüldü.");
    expect(screen.getByRole("textbox", { name: "JSON işlem sonucu" })).toHaveValue(
      '{"z":{"b":1,"a":2},"a":true}',
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Anahtarları sırala" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "JSON anahtarları sıralandı.",
    );
    expect(screen.getByRole("textbox", { name: "JSON işlem sonucu" })).toHaveValue(
      '{\n  "a": true,\n  "z": {\n    "a": 2,\n    "b": 1\n  }\n}',
    );
  });

  it("clears a derived result when its source input changes", () => {
    render(<JSONLab />);

    const input = screen.getByRole("textbox", { name: "JSON input" });
    fireEvent.change(input, { target: { value: '{"status":"OLD"}' } });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    expect(
      screen.getByRole("textbox", { name: "JSON işlem sonucu" }),
    ).not.toHaveValue("");

    fireEvent.change(input, { target: { value: '{"status":"NEW"}' } });

    expect(
      screen.queryByRole("textbox", { name: "JSON işlem sonucu" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Henüz sonuç yok")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores selected paths while showing the remaining JSON differences", () => {
    render(<JSONLab />);
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));

    fireEvent.change(screen.getByRole("textbox", { name: "JSON input" }), {
      target: {
        value: '{"id":42,"traceId":"trace-a","user":{"name":"Ada"}}',
      },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Karşılaştırılacak JSON" }),
      {
        target: {
          value: '{"id":42,"traceId":"trace-b","user":{"name":"Grace"}}',
        },
      },
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Yok sayılacak JSONPath ifadeleri",
      }),
      { target: { value: "$.traceId" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Karşılaştır" }));

    expect(screen.getByRole("status")).toHaveTextContent("1 fark bulundu.");
    const differences = screen.getByLabelText("JSON farkları");
    expect(within(differences).getByText("$.user.name")).toBeVisible();
    expect(within(differences).getByText("Ada")).toBeVisible();
    expect(within(differences).getByText("Grace")).toBeVisible();
    expect(within(differences).queryByText("$.traceId")).not.toBeInTheDocument();
  });

  it("shows both a successful JSONPath result and a useful query error", () => {
    render(<JSONLab />);
    fireEvent.click(screen.getByRole("button", { name: "JSONPath" }));

    fireEvent.change(screen.getByRole("textbox", { name: "JSON input" }), {
      target: { value: '{"users":[{"name":"Ada"}]}' },
    });
    const path = screen.getByRole("textbox", { name: "JSONPath" });
    fireEvent.change(path, { target: { value: "$.users[0].name" } });
    fireEvent.click(screen.getByRole("button", { name: "Sorgula" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "JSONPath sonucu hazır.",
    );
    expect(screen.getByRole("textbox", { name: "JSON işlem sonucu" })).toHaveValue(
      '"Ada"',
    );

    fireEvent.change(path, { target: { value: "$..name" } });
    fireEvent.click(screen.getByRole("button", { name: "Sorgula" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bu JSONPath ifadesi desteklenmiyor.",
    );
  });

  it("creates and displays a draft 2020-12 JSON Schema", () => {
    render(<JSONLab />);
    fireEvent.click(screen.getByRole("button", { name: "Schema" }));

    fireEvent.change(screen.getByRole("textbox", { name: "JSON input" }), {
      target: { value: '{"id":42,"tags":["api"],"active":true}' },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Schema oluştur" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "JSON Schema oluşturuldu.",
    );
    const result = screen.getByRole("textbox", {
      name: "JSON işlem sonucu",
    });
    expect(JSON.parse((result as HTMLTextAreaElement).value)).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        id: { type: "integer" },
        tags: { type: "array", items: { type: "string" } },
        active: { type: "boolean" },
      },
      required: ["id", "tags", "active"],
    });
  });

  it("turns a Java response DTO into a visible mock JSON example only", () => {
    render(<JSONLab />);
    fireEvent.click(
      screen.getByRole("button", { name: "Java DTO → JSON" }),
    );

    expect(
      screen.getByText(
        "Çıktıyı bir mock route body’sine kopyalayabilirsiniz.",
      ),
    ).toBeVisible();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Java response DTO" }),
      {
        target: {
          value: `
            public record UserResponse(
              UUID id,
              @JsonProperty("display_name") String displayName,
              List<RoleResponse> roles
            ) {}

            record RoleResponse(String name, boolean active) {}
          `,
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mock JSON oluştur" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Response DTO’dan mock JSON örneği oluşturuldu.",
    );
    const result = screen.getByRole("textbox", {
      name: "JSON işlem sonucu",
    });
    expect(JSON.parse((result as HTMLTextAreaElement).value)).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      display_name: "example",
      roles: [{ name: "example", active: false }],
    });
  });
});
