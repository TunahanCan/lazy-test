import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocaleProvider,
  localeStorageKey,
  useLocale,
  type Locale,
} from "../../i18n";
import { backend } from "../../lib/backend";
import type { ImportSpecResult } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspace";
import { useOpenAPIImport } from "./useOpenAPIImport";

function ImportHarness() {
  const { locale, setLocale } = useLocale();
  const { importSpec, notice } = useOpenAPIImport();
  return (
    <>
      <button type="button" onClick={() => void importSpec()}>
        Import
      </button>
      <button
        type="button"
        onClick={() => setLocale(locale === "tr" ? "en" : "tr")}
      >
        Switch language
      </button>
      {notice && <output>{notice.message}</output>}
    </>
  );
}

function renderHarness(locale: Locale) {
  localStorage.setItem(localeStorageKey, locale);
  return render(
    <LocaleProvider>
      <ImportHarness />
    </LocaleProvider>,
  );
}

const importedSpec: ImportSpecResult = {
  specId: "spec-1",
  path: "/tmp/payments.yaml",
  title: "Payments API",
  version: "1.0.0",
  baseUrl: "https://api.example.test",
  canceled: false,
  endpoints: [
    {
      id: "listPayments",
      method: "GET",
      path: "/payments",
      summary: "List payments",
      tags: ["Payments"],
    },
  ],
};

describe("useOpenAPIImport localization", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
    useWorkspaceStore.setState({ latestImportedSpec: undefined });
  });

  it("reports a successful import in English while preserving the spec title", async () => {
    vi.spyOn(backend, "importOpenAPI").mockResolvedValue(importedSpec);
    renderHarness("en");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText(
        "Payments API · 1 endpoint loaded. Open it from the APIs section.",
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(useWorkspaceStore.getState().latestImportedSpec?.title).toBe(
        "Payments API",
      ),
    );
  });

  it("reports an empty import in Turkish", async () => {
    vi.spyOn(backend, "importOpenAPI").mockResolvedValue({
      ...importedSpec,
      endpoints: [],
    });
    renderHarness("tr");

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText(
        "Payments API · Açılabilir endpoint bulunamadı.",
      ),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch language" }),
    );
    expect(
      screen.getByText("Payments API · No usable endpoints found."),
    ).toBeVisible();
  });
});
