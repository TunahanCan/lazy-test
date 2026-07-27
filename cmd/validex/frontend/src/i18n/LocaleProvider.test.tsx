import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LocaleProvider,
  localeStorageKey,
  preferredLocale,
  useLocale,
} from "./LocaleProvider";
import { translate } from "./messages";

function LocaleProbe() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <output aria-label="active locale">{locale}</output>
      <span>{t("status.openRequest.many", { count: 3 })}</span>
      <button type="button" onClick={() => setLocale("tr")}>
        Türkçe
      </button>
      <button type="button" onClick={() => setLocale("en")}>
        English
      </button>
    </div>
  );
}

describe("locale infrastructure", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "";
  });

  afterEach(() => cleanup());

  it("selects a supported browser language and falls back to English", () => {
    expect(preferredLocale(["tr-TR", "en-US"])).toBe("tr");
    expect(preferredLocale(["de-DE", "en-GB"])).toBe("en");
    expect(preferredLocale(["de-DE"])).toBe("en");
    expect(preferredLocale(undefined)).toBe("en");
  });

  it("interpolates typed catalog messages in both languages", () => {
    expect(
      translate("en", "palette.search", { workspace: "Commerce" }),
    ).toBe("Search Commerce commands…");
    expect(
      translate("tr", "palette.search", { workspace: "Commerce" }),
    ).toBe("Commerce komutlarında ara…");
  });

  it("restores, applies, and persists an explicit language choice", async () => {
    localStorage.setItem(localeStorageKey, "tr");
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByLabelText("active locale")).toHaveTextContent("tr");
    expect(screen.getByText("3 açık istek")).toBeVisible();
    await waitFor(() => expect(document.documentElement.lang).toBe("tr"));

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByLabelText("active locale")).toHaveTextContent("en");
    expect(screen.getByText("3 open requests")).toBeVisible();
    await waitFor(() => {
      expect(localStorage.getItem(localeStorageKey)).toBe("en");
      expect(document.documentElement.lang).toBe("en");
    });
  });

  it("synchronizes a valid language choice from another window", async () => {
    localStorage.setItem(localeStorageKey, "en");
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: localeStorageKey,
        newValue: "tr",
      }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("active locale")).toHaveTextContent("tr"),
    );
  });
});
