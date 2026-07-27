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
});
