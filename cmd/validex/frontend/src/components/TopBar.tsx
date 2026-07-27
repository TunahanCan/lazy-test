import { useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  ChevronDown,
  Command,
  FilePlus2,
  Import,
  Languages,
  LayoutPanelLeft,
  LayoutPanelTop,
  Moon,
  PanelRight,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useOpenAPIImport } from "../features/openapi/useOpenAPIImport";
import {
  useLocale,
  useTranslation,
  type Locale,
  type TranslationKey,
} from "../i18n";
import { shortcutLabel } from "../lib/shortcuts";
import type { BootstrapData, ThemePreference } from "../lib/types";
import { Button, IconButton, Kbd } from "../shared/ui";
import { useWorkspaceStore } from "../stores/workspace";

function Logo() {
  const t = useTranslation();
  return (
    <div className="brand" aria-label={t("chrome.validexHome")}>
      <span className="brand-mark">
        <Braces size={17} aria-hidden="true" />
      </span>
      <span>Validex</span>
    </div>
  );
}

function ThemeItem({
  value,
  active,
  icon,
}: {
  value: ThemePreference;
  active: boolean;
  icon: React.ReactNode;
}) {
  const setTheme = useWorkspaceStore((state) => state.setTheme);
  const t = useTranslation();
  const labelKeys: Record<ThemePreference, TranslationKey> = {
    system: "chrome.themeSystem",
    light: "chrome.themeLight",
    dark: "chrome.themeDark",
  };
  return (
    <DropdownMenu.Item
      className="menu-item"
      onSelect={() => setTheme(value)}
    >
      {icon}
      <span>{t(labelKeys[value])}</span>
      {active && <span className="menu-check">✓</span>}
    </DropdownMenu.Item>
  );
}

function LanguageItem({ value, active }: { value: Locale; active: boolean }) {
  const { setLocale, t } = useLocale();
  const labelKey =
    value === "tr" ? "chrome.languageTurkish" : "chrome.languageEnglish";

  return (
    <DropdownMenu.Item
      className="menu-item"
      lang={value}
      onSelect={() => setLocale(value)}
    >
      <span className="language-code" aria-hidden="true">
        {value.toLocaleUpperCase()}
      </span>
      <span>{t(labelKey)}</span>
      {active && <span className="menu-check">✓</span>}
    </DropdownMenu.Item>
  );
}

export function TopBar({ bootstrap }: { bootstrap: BootstrapData }) {
  const { locale, t } = useLocale();
  const environmentID = useWorkspaceStore((state) => state.activeEnvironmentID);
  const activeView = useWorkspaceStore((state) => state.activeView);
  const setEnvironment = useWorkspaceStore((state) => state.setEnvironment);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const setPaletteOpen = useWorkspaceStore(
    (state) => state.setCommandPaletteOpen,
  );
  const theme = useWorkspaceStore((state) => state.theme);
  const toggleLeft = useWorkspaceStore((state) => state.toggleLeft);
  const toggleRight = useWorkspaceStore((state) => state.toggleRight);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setResponsePlacement = useWorkspaceStore(
    (state) => state.setResponsePlacement,
  );
  const responsePlacement = useWorkspaceStore(
    (state) => state.responsePlacement,
  );
  const {
    dismissNotice: dismissImportNotice,
    importSpec,
    isPending: importPending,
    notice: importNotice,
  } = useOpenAPIImport();

  const activeEnvironment = useMemo(
    () =>
      bootstrap.environments.find(
        (environment) => environment.id === environmentID,
      ) ?? bootstrap.environments[0],
    [bootstrap.environments, environmentID],
  );
  const environmentLabel = (environment: (typeof bootstrap.environments)[number]) =>
    environment.id === "none" ? t("chrome.noEnvironment") : environment.name;

  return (
    <>
      <header className="topbar">
        <Logo />
        <div className="topbar-divider" />

        <div className="topbar-select" aria-label={t("chrome.workspace")}>
          <span className="select-label">{t("chrome.workspace")}</span>
          <strong>{bootstrap.workspaceName}</strong>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className={`environment-select ${
                activeEnvironment?.id === "none" ? "neutral" : ""
              }`}
            >
              <span className="environment-indicator" />
              {activeEnvironment
                ? environmentLabel(activeEnvironment)
                : t("chrome.environment")}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="start" sideOffset={6}>
              <DropdownMenu.Label className="menu-label">
                {t("chrome.environmentMenu")}
              </DropdownMenu.Label>
              {bootstrap.environments.map((environment) => (
                <DropdownMenu.Item
                  key={environment.id}
                  className={`menu-item environment-menu-item ${
                    environment.id === "none" ? "neutral" : ""
                  }`}
                  onSelect={() => setEnvironment(environment.id)}
                >
                  <span className="environment-indicator" />
                  {environmentLabel(environment)}
                  {environment.id === environmentID && (
                    <span className="menu-check">✓</span>
                  )}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          className="global-search"
          onClick={() => setPaletteOpen(true)}
          aria-label={t("chrome.openCommandPalette")}
        >
          <Search size={15} aria-hidden="true" />
          <span>{t("chrome.searchCommands")}</span>
          <Kbd>{shortcutLabel("K")}</Kbd>
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="primary" className="new-button">
              <Plus size={15} aria-hidden="true" />
              {t("chrome.new")}
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() =>
                  openTab({
                    name: t("chrome.untitledRequest"),
                    url: "",
                    dirty: true,
                  })
                }
              >
                <FilePlus2 size={16} /> {t("chrome.newRequest")}
                <span className="menu-shortcut">{shortcutLabel("N")}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="menu-item"
                disabled={importPending}
                onSelect={() => void importSpec()}
              >
                <Import size={16} /> {t("chrome.importOpenAPI")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <IconButton label={t("chrome.layoutAndSettings")}>
              <Settings size={17} />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              {activeView === "requests" && (
                <>
                  <DropdownMenu.Label className="menu-label">
                    {t("chrome.requestLayout")}
                  </DropdownMenu.Label>
                  <DropdownMenu.Item className="menu-item" onSelect={toggleLeft}>
                    <LayoutPanelLeft size={16} />{" "}
                    {t("chrome.toggleRequestPanel")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="menu-item" onSelect={toggleRight}>
                    <PanelRight size={16} /> {t("chrome.toggleContextPanel")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() =>
                      setResponsePlacement(
                        responsePlacement === "vertical"
                          ? "horizontal"
                          : "vertical",
                      )
                    }
                  >
                    <LayoutPanelTop size={16} />{" "}
                    {t("chrome.response", {
                      placement:
                        responsePlacement === "vertical"
                          ? t("chrome.responseBottom")
                          : t("chrome.responseRight"),
                    })}
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="menu-item" onSelect={resetLayout}>
                    <RotateCcw size={16} /> {t("chrome.resetLayout")}
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="menu-separator" />
                </>
              )}
              <DropdownMenu.Label className="menu-label">
                {t("chrome.appearance")}
              </DropdownMenu.Label>
              <ThemeItem
                value="system"
                active={theme === "system"}
                icon={<Command size={16} />}
              />
              <ThemeItem
                value="light"
                active={theme === "light"}
                icon={<Sun size={16} />}
              />
              <ThemeItem
                value="dark"
                active={theme === "dark"}
                icon={<Moon size={16} />}
              />
              <DropdownMenu.Separator className="menu-separator" />
              <DropdownMenu.Label className="menu-label">
                <Languages size={13} aria-hidden="true" />{" "}
                {t("chrome.language")}
              </DropdownMenu.Label>
              <LanguageItem value="tr" active={locale === "tr"} />
              <LanguageItem value="en" active={locale === "en"} />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      {importNotice && (
        <div
          className="toast"
          role={importNotice.tone === "error" ? "alert" : "status"}
          aria-live={importNotice.tone === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {importNotice.tone === "error" ? (
            <AlertCircle size={15} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={15} aria-hidden="true" />
          )}
          <span>{importNotice.message}</span>
          <IconButton
            label={t("chrome.dismissNotification")}
            onClick={dismissImportNotice}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
    </>
  );
}
