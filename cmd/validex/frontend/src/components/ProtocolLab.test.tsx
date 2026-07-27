import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import { ProtocolLab } from "./ProtocolLab";

describe("ProtocolLab", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders parsed SSE events returned by the backend", async () => {
    const runSSE = vi.spyOn(backend, "runSSE").mockResolvedValueOnce({
      statusCode: 200,
      headers: {
        "Content-Type": ["text/event-stream"],
        "X-Stream": ["ready"],
      },
      events: [
        {
          event: "inventory.update",
          id: "event-42",
          data: "payload-ready",
          retryMillis: 1_500,
          hasRetry: true,
        },
      ],
      durationMs: 84,
    });

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    expect(
      await screen.findByRole("cell", { name: "inventory.update" }),
    ).toBeVisible();
    expect(screen.getByRole("cell", { name: "event-42" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "1500 ms" })).toBeVisible();
    expect(screen.getByText("payload-ready")).toBeVisible();
    expect(screen.getByText("84 ms")).toBeVisible();
    expect(runSSE).toHaveBeenCalledOnce();
    expect(runSSE).toHaveBeenCalledWith({
      operationId: expect.stringMatching(/^protocol-sse-/),
      url: "http://localhost:8080/events",
      headers: {},
      timeoutMs: 30_000,
      maxEvents: 25,
      insecureSkipVerify: false,
    });
  });

  it("shows a structured backend error with recovery context", async () => {
    vi.spyOn(backend, "runSSE").mockResolvedValueOnce({
      statusCode: 0,
      headers: {},
      events: [],
      durationMs: 0,
      error: {
        code: "sse_connect_failed",
        title: "SSE bağlantısı kurulamadı",
        message: "Sunucu bağlantıyı reddetti.",
        hint: "Servisin çalıştığını ve portu kontrol edin.",
        technical: "dial tcp 127.0.0.1:8080: connect: connection refused",
      },
    });

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("SSE bağlantısı kurulamadı");
    expect(alert).toHaveTextContent("Sunucu bağlantıyı reddetti.");
    expect(alert).toHaveTextContent("Servisin çalıştığını ve portu kontrol edin.");
    const details = within(alert)
      .getByText("Teknik ayrıntı")
      .closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("connection refused");
  });

  it("sends WebSocket connection input and renders text and binary messages", async () => {
    const runWebSocket = vi
      .spyOn(backend, "runWebSocket")
      .mockResolvedValueOnce({
        statusCode: 101,
        headers: {
          Upgrade: ["websocket"],
          "Sec-WebSocket-Protocol": ["validex.v1"],
        },
        protocol: "validex.v1",
        messages: [
          {
            type: "text",
            data: '{"type":"order.updated","id":"42"}',
            encoding: "utf-8",
            sizeBytes: 34,
          },
          {
            type: "binary",
            data: "AP+A",
            encoding: "base64",
            sizeBytes: 3,
          },
        ],
        durationMs: 48,
      });

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "WebSocket" }));
    fireEvent.change(screen.getByLabelText("WebSocket URL"), {
      target: { value: "wss://api.example.test/orders" },
    });
    const [timeoutInput, messageLimitInput] =
      screen.getAllByRole("spinbutton");
    fireEvent.change(timeoutInput, {
      target: { value: "12" },
    });
    fireEvent.change(messageLimitInput, {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/^Subprotocols/), {
      target: { value: "graphql-transport-ws, validex.v1" },
    });
    fireEvent.change(screen.getByLabelText(/Request headers · JSON/), {
      target: { value: '{"Authorization":"Bearer local-token"}' },
    });
    fireEvent.change(
      screen.getByLabelText("Gönderilecek text mesajı · isteğe bağlı"),
      {
        target: {
          value: '{"type":"subscribe","topic":"orders"}',
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Gönder ve dinle" }),
    );

    await waitFor(() => expect(runWebSocket).toHaveBeenCalledOnce());
    expect(runWebSocket).toHaveBeenCalledWith({
      operationId: expect.stringMatching(/^protocol-websocket-/),
      url: "wss://api.example.test/orders",
      headers: { Authorization: "Bearer local-token" },
      subprotocols: ["graphql-transport-ws", "validex.v1"],
      send: [
        {
          type: "text",
          data: '{"type":"subscribe","topic":"orders"}',
          encoding: "utf-8",
        },
      ],
      timeoutMs: 12_000,
      maxMessages: 2,
      insecureSkipVerify: false,
    });

    const result = screen.getByRole("region", { name: "WebSocket sonucu" });
    expect(within(result).getByText("101")).toBeVisible();
    expect(
      within(result).getByText("Protocol").closest("div"),
    ).toHaveTextContent("validex.v1");
    expect(within(result).getByText("48 ms")).toBeVisible();
    expect(
      within(result).getByText('{"type":"order.updated","id":"42"}'),
    ).toBeVisible();
    expect(within(result).getByText("AP+A")).toBeVisible();
    expect(within(result).getByText("text")).toBeVisible();
    expect(within(result).getByText("binary")).toBeVisible();
    expect(within(result).getByText("base64 · 3 B")).toBeVisible();
  });

  it("keeps received WebSocket messages visible when the session ends with an error", async () => {
    vi.spyOn(backend, "runWebSocket").mockResolvedValueOnce({
      statusCode: 101,
      headers: {},
      protocol: "",
      messages: [
        {
          type: "text",
          data: '{"type":"snapshot","orders":3}',
          encoding: "utf-8",
          sizeBytes: 30,
        },
      ],
      durationMs: 30_000,
      error: {
        code: "websocket_timeout",
        title: "WebSocket oturumu tamamlanamadı",
        message: "Timeout dolmadan yalnız bir mesaj alındı.",
        hint: "Mesaj sınırını veya timeout değerini kontrol edin.",
      },
    });

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "WebSocket" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Bağlan ve dinle" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("WebSocket oturumu tamamlanamadı");
    expect(alert).toHaveTextContent(
      "Timeout dolmadan yalnız bir mesaj alındı.",
    );
    const result = screen.getByRole("region", { name: "WebSocket sonucu" });
    expect(
      within(result).getByText('{"type":"snapshot","orders":3}'),
    ).toBeVisible();
    expect(within(result).getAllByRole("listitem")).toHaveLength(1);
  });

  it("sends gRPC connection settings and lists reflected services", async () => {
    const inspectGRPC = vi.spyOn(backend, "inspectGRPC").mockResolvedValueOnce({
      services: [
        "com.validex.orders.v1.OrderService",
        "grpc.health.v1.Health",
      ],
      reflectionVersion: "v1",
      connectionState: "READY",
      durationMs: 31,
    });

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "gRPC" }));
    fireEvent.change(screen.getByLabelText(/Sunucu adresi/), {
      target: { value: "api.example.test:7443" },
    });
    fireEvent.click(screen.getByLabelText(/TLS kullan/));
    fireEvent.change(screen.getByLabelText(/TLS server name/), {
      target: { value: "api.example.test" },
    });
    fireEvent.change(screen.getByLabelText(/gRPC metadata/), {
      target: { value: '{"authorization":"Bearer local-token"}' },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Servisleri keşfet" }),
    );

    expect(
      await screen.findByText("com.validex.orders.v1.OrderService"),
    ).toBeVisible();
    expect(screen.getByText("grpc.health.v1.Health")).toBeVisible();
    const result = screen.getByRole("region", { name: "gRPC sonucu" });
    expect(within(result).getByText("READY")).toBeVisible();
    expect(within(result).getByText("v1")).toBeVisible();
    expect(within(result).getByText("31 ms")).toBeVisible();
    expect(inspectGRPC).toHaveBeenCalledOnce();
    expect(inspectGRPC).toHaveBeenCalledWith({
      operationId: expect.stringMatching(/^protocol-grpc-/),
      address: "api.example.test:7443",
      metadata: { authorization: "Bearer local-token" },
      timeoutMs: 10_000,
      useTLS: true,
      serverName: "api.example.test",
      insecureSkipVerify: false,
    });
  });

  it("only enables the SSE certificate bypass for HTTPS and maps explicit consent", async () => {
    const runSSE = vi.spyOn(backend, "runSSE").mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      events: [],
      durationMs: 9,
    });

    render(<ProtocolLab />);
    const bypass = screen.getByRole("checkbox", {
      name: /Sertifika doğrulamasını atla/,
    });
    expect(bypass).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Event stream URL"), {
      target: { value: "https://localhost:8443/events" },
    });
    expect(bypass).toBeEnabled();
    fireEvent.click(bypass);
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    await waitFor(() => expect(runSSE).toHaveBeenCalledOnce());
    expect(runSSE.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ insecureSkipVerify: true }),
    );
  });

  it("only enables the WebSocket certificate bypass for WSS and maps explicit consent", async () => {
    const runWebSocket = vi
      .spyOn(backend, "runWebSocket")
      .mockResolvedValueOnce({
        statusCode: 101,
        headers: {},
        protocol: "",
        messages: [],
        durationMs: 7,
      });

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "WebSocket" }));
    const bypass = screen.getByRole("checkbox", {
      name: /Sertifika doğrulamasını atla/,
    });
    expect(bypass).toBeDisabled();

    fireEvent.change(screen.getByLabelText("WebSocket URL"), {
      target: { value: "wss://localhost:8443/ws" },
    });
    expect(bypass).toBeEnabled();
    fireEvent.click(bypass);
    fireEvent.click(
      screen.getByRole("button", { name: "Bağlan ve dinle" }),
    );

    await waitFor(() => expect(runWebSocket).toHaveBeenCalledOnce());
    expect(runWebSocket.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ insecureSkipVerify: true }),
    );
  });

  it("does not call the backend when header JSON is invalid", async () => {
    const runSSE = vi.spyOn(backend, "runSSE");

    render(<ProtocolLab />);
    fireEvent.change(screen.getByLabelText(/Request headers · JSON/), {
      target: { value: '{"Authorization":' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Header geçerli bir JSON nesnesi olmalı.",
    );
    await waitFor(() => expect(runSSE).not.toHaveBeenCalled());
  });

  it("shows rejected backend calls instead of leaving a loading state", async () => {
    vi.spyOn(backend, "runSSE").mockRejectedValueOnce(
      new Error("native bridge disconnected"),
    );

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Validex backend bağlantısı kesildi");
    expect(alert).toHaveTextContent(
      "Protokol işlemi masaüstü backend’inde tamamlanamadı.",
    );
    const details = within(alert)
      .getByText("Teknik ayrıntı")
      .closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("native bridge disconnected");
    expect(
      screen.getByRole("button", { name: "Akışı dinle" }),
    ).toBeEnabled();
  });

  it.each([
    {
      mode: "SSE",
      startLabel: "Akışı dinle",
      operationPrefix: "protocol-sse-",
      runMethod: "runSSE" as const,
      result: {
        statusCode: 200,
        headers: {},
        events: [],
        durationMs: 15,
        error: {
          code: "tool_canceled",
          title: "SSE akışı tamamlanamadı",
          message: "İşlem iptal edildi.",
        },
      },
    },
    {
      mode: "WebSocket",
      startLabel: "Bağlan ve dinle",
      operationPrefix: "protocol-websocket-",
      runMethod: "runWebSocket" as const,
      result: {
        statusCode: 101,
        headers: {},
        protocol: "",
        messages: [
          {
            type: "text" as const,
            data: "partial-message",
            encoding: "utf-8" as const,
            sizeBytes: 15,
          },
        ],
        durationMs: 18,
        error: {
          code: "tool_canceled",
          title: "WebSocket exchange tamamlanamadı",
          message: "İşlem iptal edildi.",
        },
      },
    },
    {
      mode: "gRPC",
      startLabel: "Servisleri keşfet",
      operationPrefix: "protocol-grpc-",
      runMethod: "inspectGRPC" as const,
      result: {
        services: [],
        reflectionVersion: "",
        connectionState: "",
        durationMs: 12,
        error: {
          code: "tool_canceled",
          title: "gRPC reflection tamamlanamadı",
          message: "İşlem iptal edildi.",
        },
      },
    },
  ])(
    "cancels a running $mode operation with its generated operation ID",
    async ({ mode, startLabel, operationPrefix, runMethod, result }) => {
      let finishOperation: (() => void) | undefined;
      const operationPromise = new Promise<typeof result>((resolve) => {
        finishOperation = () => resolve(result);
      });
      const run = vi
        .spyOn(backend, runMethod)
        .mockReturnValueOnce(operationPromise as never);
      const cancel = vi
        .spyOn(backend, "cancelToolOperation")
        .mockImplementationOnce(async () => {
          finishOperation?.();
          return true;
        });

      render(<ProtocolLab />);
      if (mode !== "SSE") {
        fireEvent.click(screen.getByRole("button", { name: mode }));
      }
      fireEvent.click(screen.getByRole("button", { name: startLabel }));

      const cancelButton = await screen.findByRole("button", {
        name: "İptal et",
      });
      const call = run.mock.calls[0]?.[0] as { operationId: string };
      expect(call.operationId).toMatch(new RegExp(`^${operationPrefix}`));

      fireEvent.click(cancelButton);
      await waitFor(() =>
        expect(cancel).toHaveBeenCalledWith(call.operationId),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "İşlem iptal edildi.",
      );
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "İptal et" }),
        ).not.toBeInTheDocument(),
      );
    },
  );

  it("reports a rejected cancel instead of presenting it as successful", async () => {
    vi.spyOn(backend, "runSSE").mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    vi.spyOn(backend, "cancelToolOperation").mockResolvedValueOnce(false);

    render(<ProtocolLab />);
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "İptal et" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("İşlem durdurulamadı");
    expect(alert).toHaveTextContent(
      "Backend bu operation ID için çalışan bir işlem bulamadı.",
    );
    expect(
      screen.getByRole("button", { name: "İptal et" }),
    ).toBeEnabled();
  });
});
