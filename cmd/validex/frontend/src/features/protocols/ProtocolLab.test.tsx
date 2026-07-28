import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocaleProvider,
  localeStorageKey,
  type Locale,
} from "../../i18n";
import { backend } from "../../lib/backend";
import { ProtocolLab } from "./ProtocolLab";

function renderProtocol(locale: Locale = "tr") {
  localStorage.setItem(localeStorageKey, locale);
  return render(
    <LocaleProvider>
      <ProtocolLab />
    </LocaleProvider>,
  );
}

describe("ProtocolLab", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders English labels, validation, and locale-aware durations", async () => {
    vi.spyOn(backend, "runSSE").mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      events: [],
      durationMs: 1_500,
    });

    renderProtocol("en");

    expect(
      screen.getByRole("heading", { name: "SSE Stream" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Listen to stream" }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Request headers · JSON/), {
      target: { value: '{"Authorization":' },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Listen to stream" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Header must be a valid JSON object.",
    );

    fireEvent.change(screen.getByLabelText(/Request headers · JSON/), {
      target: { value: "{}" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Listen to stream" }),
    );
    expect(await screen.findByText("1.5 sec")).toBeVisible();
    expect(screen.getByText("The stream sent no events")).toBeVisible();
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

    renderProtocol();
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

    renderProtocol();
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("SSE bağlantısı tamamlanamadı");
    expect(alert).toHaveTextContent("SSE akışı tamamlanamadı.");
    const details = within(alert)
      .getByText("Teknik ayrıntı")
      .closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(details).toHaveTextContent("SSE bağlantısı kurulamadı");
    expect(details).toHaveTextContent("Sunucu bağlantıyı reddetti.");
    expect(details).toHaveTextContent(
      "Servisin çalıştığını ve portu kontrol edin.",
    );
    expect(details).toHaveTextContent("connection refused");
  });

  it("only enables the SSE certificate bypass for HTTPS and maps explicit consent", async () => {
    const runSSE = vi.spyOn(backend, "runSSE").mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      events: [],
      durationMs: 9,
    });

    renderProtocol();
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

  it("does not call the backend when header JSON is invalid", async () => {
    const runSSE = vi.spyOn(backend, "runSSE");

    renderProtocol();
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

    renderProtocol();
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Validex backend bağlantısı kesildi");
    expect(alert).toHaveTextContent(
      "SSE akışı masaüstü backend’inde tamamlanamadı.",
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

  it("cancels a running SSE operation with its generated operation ID", async () => {
    const result = {
      statusCode: 200,
      headers: {},
      events: [],
      durationMs: 15,
      error: {
        code: "tool_canceled",
        title: "SSE akışı tamamlanamadı",
        message: "İşlem iptal edildi.",
      },
    };
    let finishOperation: (() => void) | undefined;
    const operationPromise = new Promise<typeof result>((resolve) => {
      finishOperation = () => resolve(result);
    });
    const run = vi
      .spyOn(backend, "runSSE")
      .mockReturnValueOnce(operationPromise);
    const cancel = vi
      .spyOn(backend, "cancelToolOperation")
      .mockImplementationOnce(async () => {
        finishOperation?.();
        return true;
      });

    renderProtocol();
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));

    const cancelButton = await screen.findByRole("button", {
      name: "İptal et",
    });
    const call = run.mock.calls[0]?.[0];
    expect(call?.operationId).toMatch(/^protocol-sse-/);

    fireEvent.click(cancelButton);
    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith(call?.operationId),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Akış tamamlanmadan iptal edildi.",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "İptal et" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("reports a rejected cancel instead of presenting it as successful", async () => {
    vi.spyOn(backend, "runSSE").mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    vi.spyOn(backend, "cancelToolOperation").mockResolvedValueOnce(false);

    renderProtocol();
    fireEvent.click(screen.getByRole("button", { name: "Akışı dinle" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "İptal et" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("SSE akışı durdurulamadı");
    expect(alert).toHaveTextContent(
      "Backend bu operation ID için çalışan bir SSE akışı bulamadı.",
    );
    expect(
      screen.getByRole("button", { name: "İptal et" }),
    ).toBeEnabled();
  });
});
