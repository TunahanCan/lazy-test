import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResponseEnvelope } from "../lib/types";
import { createRequestTab } from "../stores/workspace";
import { ResponsePanel } from "./ResponsePanel";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value?: string }) => (
    <textarea aria-label="Response body" value={value} readOnly />
  ),
}));

const response: ResponseEnvelope = {
  requestId: "request-1",
  statusCode: 200,
  status: "200 OK",
  durationMs: 100,
  sizeBytes: 128,
  contentType: "application/json",
  protocol: "HTTP/2",
  remoteAddr: "203.0.113.10:443",
  tls: "TLS 1.3",
  traceId: "trace-1234567890",
  headers: { "content-type": ["application/json"] },
  cookies: [
    {
      name: "session",
      value: "abc",
      path: "/",
      domain: "example.test",
      httpOnly: true,
      secure: true,
    },
  ],
  body: '{\n  "ok": true\n}',
  rawBody: '{"ok":true}',
  timeline: [
    {
      id: "server",
      label: "Server",
      durationMs: 25,
      percent: 25,
    },
  ],
  resolvedUrl: "https://example.test/health",
};

describe("ResponsePanel", () => {
  afterEach(cleanup);

  it("reads the response from the request tab and hides unfinished views", async () => {
    render(
      <ResponsePanel
        tab={createRequestTab({ id: "request-1", response })}
      />,
    );

    expect(screen.getByText("200 OK")).toBeVisible();
    expect(screen.getByRole("tab", { name: /Body/i })).toBeVisible();
    expect(
      await screen.findByLabelText("Response body"),
    ).toHaveValue(response.body);
    expect(
      screen.queryByRole("tab", { name: /Assertions/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Contract/i }),
    ).not.toBeInTheDocument();
  });

  it("shows progress while the request is running", () => {
    render(
      <ResponsePanel
        tab={createRequestTab({ id: "request-1", running: true })}
      />,
    );

    expect(screen.getByText("Request gönderiliyor…")).toBeVisible();
    expect(screen.queryByText("Henüz response yok")).not.toBeInTheDocument();
  });

  it("presents a canceled request as a neutral status", () => {
    render(
      <ResponsePanel
        tab={createRequestTab({
          id: "request-1",
          userError: {
            code: "request_canceled",
            title: "Request iptal edildi",
            message: "İstek kullanıcı tarafından durduruldu.",
          },
        })}
      />,
    );

    expect(screen.getByText("Canceled")).toBeVisible();
    expect(screen.getByText("Request iptal edildi")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("scales timeline phases against the total duration", () => {
    const { container } = render(
      <ResponsePanel
        tab={createRequestTab({
          id: "request-1",
          response,
          responseSection: "timeline",
        })}
      />,
    );

    expect(container.querySelector(".timeline-bar")).toHaveStyle({
      width: "25%",
    });
  });

  it("shows OpenAPI contract drift only for imported request tabs", () => {
    render(
      <ResponsePanel
        tab={createRequestTab({
          id: "request-1",
          openApi: { specId: "orders", path: "/orders/{id}" },
          responseSection: "contract",
          response: {
            ...response,
            contract: {
              available: true,
              ok: false,
              truncated: false,
              method: "GET",
              path: "/orders/{id}",
              findings: [
                {
                  path: "$.status",
                  type: "enum_violation",
                  actual: "UNKNOWN",
                  allowed: ["CREATED", "SHIPPED"],
                },
              ],
            },
          },
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: /Contract/i })).toBeVisible();
    expect(screen.getByText("1 contract farkı bulundu")).toBeVisible();
    expect(screen.getByText("$.status")).toBeVisible();
    expect(screen.getByText("Enum ihlali")).toBeVisible();
    expect(screen.getByText("CREATED, SHIPPED")).toBeVisible();
  });

  it("explains when contract findings are capped", () => {
    render(
      <ResponsePanel
        tab={createRequestTab({
          id: "request-bounded",
          openApi: { specId: "orders", path: "/orders" },
          responseSection: "contract",
          response: {
            ...response,
            contract: {
              available: true,
              ok: false,
              truncated: true,
              method: "GET",
              path: "/orders",
              findings: [
                {
                  path: "$[0]",
                  type: "type_mismatch",
                  expected: "string",
                  actual: "number",
                },
              ],
            },
          },
        })}
      />,
    );

    expect(
      screen.getByText("1 contract farkı bulundu (ilk 1000 gösteriliyor)"),
    ).toBeVisible();
    expect(screen.getByText("Tip veya kısıt")).toBeVisible();
  });
});
