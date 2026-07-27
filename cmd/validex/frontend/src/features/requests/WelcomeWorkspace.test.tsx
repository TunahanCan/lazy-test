import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocaleProvider,
  localeStorageKey,
  type Locale,
} from "../../i18n";
import { WelcomeWorkspace } from "./WelcomeWorkspace";

function renderWelcome(locale: Locale) {
  localStorage.setItem(localeStorageKey, locale);
  return render(
    <LocaleProvider>
      <WelcomeWorkspace
        importPending={false}
        importNotice={null}
        onCreateRequest={vi.fn()}
        onImportOpenAPI={vi.fn()}
        onOpenTool={vi.fn()}
      />
    </LocaleProvider>,
  );
}

describe("WelcomeWorkspace localization", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders the Turkish welcome copy and translated tool metadata", () => {
    renderWelcome("tr");

    expect(
      screen.getByRole("heading", {
        name: "Tüm API çalışmalarınızı tek bir yerde toplayın.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Mock Sunucu aracını aç" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: "Tüm API çalışmalarınızı tek bir yerde toplayın.",
      }),
    ).toBeVisible();
  });

  it("renders the English welcome copy", () => {
    renderWelcome("en");

    expect(
      screen.getByRole("heading", {
        name: "Bring all your API work into one place.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open Mock Server" }),
    ).toBeVisible();
  });
});
