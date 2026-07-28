import * as Tooltip from "@radix-ui/react-tooltip";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider, localeStorageKey } from "../../i18n";
import { useCollectionLibraryStore } from "../../stores/collectionLibrary";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../../stores/workspace";
import { RequestTabs } from "./RequestTabs";

function renderTabs() {
  return render(
    <LocaleProvider>
      <Tooltip.Provider>
        <RequestTabs />
      </Tooltip.Provider>
    </LocaleProvider>,
  );
}

describe("RequestTabs close behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(localeStorageKey, "tr");
    useWorkspaceStore.persist.clearStorage();
    useWorkspaceStore.setState({
      tabs: [],
      activeTabID: "",
      recentlyClosed: [],
    });
    useCollectionLibraryStore.setState({
      collections: [],
      requests: [],
      expandedCollectionIds: [],
    });
  });

  afterEach(cleanup);

  it("keeps only tabs in the tablist and describes a selected draft", async () => {
    const tab = createRequestTab({
      id: "dirty-request",
      name: "Dirty request",
      dirty: true,
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });
    renderTabs();

    const tablist = screen.getByRole("tablist", { name: "Açık istekler" });
    const tabButton = within(tablist).getByRole("tab", {
      name: /Dirty request.*Yerel taslak/i,
    });
    expect(Array.from(tablist.children)).toEqual([tabButton]);
    expect(within(tablist).queryByRole("button")).not.toBeInTheDocument();
    expect(tabButton).toHaveAttribute("aria-selected", "true");
    expect(tabButton).toHaveAccessibleDescription(
      "Dirty request sekmesini kapat",
    );
    expect(tabButton).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringContaining("Delete"),
    );

    const pointerCloseTarget = tabButton.querySelector(
      ".tab-close",
    ) as HTMLElement;
    expect(pointerCloseTarget).toBeVisible();
    fireEvent.click(pointerCloseTarget);
    const dialog = await screen.findByRole("dialog", {
      name: "Taslak sekme kapatılsın mı?",
    });
    expect(dialog).toHaveTextContent(/yerel olarak kaydedildi/i);
    expect(dialog).toHaveTextContent(/komut paletinden yeniden açabilirsiniz/i);
    expect(
      screen.queryByRole("button", { name: "Kaydet" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sekmeyi kapat" }));
    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
    expect(useWorkspaceStore.getState().recentlyClosed[0]?.id).toBe(tab.id);
  });

  it("closes a clean tab from its announced keyboard shortcut", () => {
    const tab = createRequestTab({
      id: "keyboard-close",
      name: "Keyboard close",
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });
    renderTabs();

    const tabButton = screen.getByRole("tab", {
      name: /Keyboard close/i,
    });
    expect(tabButton).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringContaining("Delete"),
    );

    fireEvent.keyDown(tabButton, { key: "Delete" });

    expect(useWorkspaceStore.getState().tabs).toHaveLength(0);
    expect(useWorkspaceStore.getState().recentlyClosed[0]?.id).toBe(tab.id);
  });

  it("disables bulk close actions when every candidate is dirty or pinned", async () => {
    const current = createRequestTab({
      id: "current",
      name: "Current request",
    });
    const dirty = createRequestTab({
      id: "dirty",
      name: "Dirty request",
      dirty: true,
    });
    const pinned = createRequestTab({
      id: "pinned",
      name: "Pinned request",
      pinned: true,
    });
    useWorkspaceStore.setState({
      tabs: [current, dirty, pinned],
      activeTabID: current.id,
    });
    renderTabs();

    fireEvent.contextMenu(
      screen.getByRole("tab", { name: /Current request/i }),
      { clientX: 20, clientY: 20 },
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", {
        name: "Diğer temiz sekmeleri kapat",
      }),
    ).toHaveAttribute("data-disabled");
    expect(
      within(menu).getByRole("menuitem", {
        name: "Sağdaki temiz sekmeleri kapat",
      }),
    ).toHaveAttribute("data-disabled");
  });

  it("keeps running requests open until they are canceled", () => {
    const running = createRequestTab({
      id: "running",
      name: "Running request",
      running: true,
    });
    useWorkspaceStore.setState({
      tabs: [running],
      activeTabID: running.id,
    });
    renderTabs();

    const tabButton = screen.getByRole("tab", {
      name: /Running request.*İstek çalışıyor/i,
    });
    expect(tabButton).not.toHaveAttribute("aria-keyshortcuts");
    const pointerCloseTarget = tabButton.querySelector(
      ".tab-close",
    ) as HTMLElement;
    expect(pointerCloseTarget).toHaveAttribute(
      "title",
      "Sekmeyi kapatmadan önce isteği iptal edin",
    );
    fireEvent.click(pointerCloseTarget);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renames a tab from the double-click dialog and trims the new name", async () => {
    const tab = createRequestTab({
      id: "rename-double-click",
      name: "Original request",
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });
    renderTabs();

    fireEvent.doubleClick(
      screen.getByRole("tab", { name: /Original request/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "İsteği yeniden adlandır",
    });
    const nameInput = within(dialog).getByLabelText("Yeni istek adı");
    expect(nameInput).toHaveValue("Original request");

    fireEvent.change(nameInput, {
      target: { value: "  Renamed request  " },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adı güncelle" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "İsteği yeniden adlandır" }),
      ).not.toBeInTheDocument(),
    );
    expect(useWorkspaceStore.getState().tabs[0]).toMatchObject({
      name: "Renamed request",
      dirty: true,
    });
  });

  it("renames the linked saved request without clearing draft changes", async () => {
    const collectionId = useCollectionLibraryStore
      .getState()
      .createCollection("Core API")!;
    const savedRequestId = useCollectionLibraryStore
      .getState()
      .saveRequest(collectionId, {
        name: "Original request",
        method: "GET",
        url: "https://api.example.test/users",
        headers: [],
        body: "",
      })!;
    const tab = createRequestTab({
      id: "linked-dirty-request",
      collectionId,
      savedRequestId,
      name: "Original request",
      url: "https://api.example.test/users?draft=true",
      dirty: true,
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });
    renderTabs();

    fireEvent.doubleClick(
      screen.getByRole("tab", { name: /Original request/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "İsteği yeniden adlandır",
    });
    fireEvent.change(within(dialog).getByLabelText("Yeni istek adı"), {
      target: { value: "Renamed saved request" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Adı güncelle" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "İsteği yeniden adlandır" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      useCollectionLibraryStore
        .getState()
        .requests.find((request) => request.id === savedRequestId),
    ).toMatchObject({ name: "Renamed saved request" });
    expect(useWorkspaceStore.getState().tabs[0]).toMatchObject({
      name: "Renamed saved request",
      url: "https://api.example.test/users?draft=true",
      dirty: true,
    });
  });

  it("opens the rename dialog from the tab context menu", async () => {
    const tab = createRequestTab({
      id: "rename-context-menu",
      name: "Context request",
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });
    renderTabs();

    fireEvent.contextMenu(
      screen.getByRole("tab", { name: /Context request/i }),
      { clientX: 20, clientY: 20 },
    );
    const menu = await screen.findByRole("menu");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Yeniden adlandır" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "İsteği yeniden adlandır",
    });
    const nameInput = within(dialog).getByLabelText("Yeni istek adı");
    fireEvent.change(nameInput, { target: { value: " " } });
    expect(
      within(dialog).getByRole("button", { name: "Adı güncelle" }),
    ).toBeDisabled();
  });

  it("moves and wraps roving tab focus with arrows, Home, and End", async () => {
    const first = createRequestTab({ id: "first", name: "First request" });
    const middle = createRequestTab({ id: "middle", name: "Middle request" });
    const last = createRequestTab({ id: "last", name: "Last request" });
    useWorkspaceStore.setState({
      tabs: [first, middle, last],
      activeTabID: middle.id,
    });
    renderTabs();

    const firstTab = screen.getByRole("tab", { name: /First request/i });
    const middleTab = screen.getByRole("tab", { name: /Middle request/i });
    const lastTab = screen.getByRole("tab", { name: /Last request/i });
    expect(firstTab).toHaveAttribute("tabindex", "-1");
    expect(middleTab).toHaveAttribute("tabindex", "0");
    expect(lastTab).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(middleTab, { key: "ArrowRight" });
    await waitFor(() => expect(lastTab).toHaveFocus());
    expect(lastTab).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(lastTab, { key: "ArrowRight" });
    await waitFor(() => expect(firstTab).toHaveFocus());

    fireEvent.keyDown(firstTab, { key: "ArrowLeft" });
    await waitFor(() => expect(lastTab).toHaveFocus());

    fireEvent.keyDown(lastTab, { key: "Home" });
    await waitFor(() => expect(firstTab).toHaveFocus());

    fireEvent.keyDown(firstTab, { key: "End" });
    await waitFor(() => expect(lastTab).toHaveFocus());
    expect(useWorkspaceStore.getState().activeTabID).toBe(last.id);
  });

  it("reorders the focused tab with Alt+Shift+Arrow keys", async () => {
    const first = createRequestTab({ id: "first", name: "First request" });
    const middle = createRequestTab({ id: "middle", name: "Middle request" });
    const last = createRequestTab({ id: "last", name: "Last request" });
    useWorkspaceStore.setState({
      tabs: [first, middle, last],
      activeTabID: middle.id,
    });
    renderTabs();

    const middleTab = screen.getByRole("tab", { name: /Middle request/i });
    expect(middleTab).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringContaining("Alt+Shift+ArrowRight"),
    );

    fireEvent.keyDown(middleTab, {
      key: "ArrowRight",
      altKey: true,
      shiftKey: true,
    });

    expect(useWorkspaceStore.getState().tabs.map((tab) => tab.id)).toEqual([
      first.id,
      last.id,
      middle.id,
    ]);
    await waitFor(() => expect(middleTab).toHaveFocus());
    expect(useWorkspaceStore.getState().activeTabID).toBe(middle.id);
  });

  it("preserves pointer drag-and-drop reordering", () => {
    const first = createRequestTab({ id: "drag-first", name: "First" });
    const middle = createRequestTab({ id: "drag-middle", name: "Middle" });
    const last = createRequestTab({ id: "drag-last", name: "Last" });
    useWorkspaceStore.setState({
      tabs: [first, middle, last],
      activeTabID: first.id,
    });
    renderTabs();

    const firstTab = screen.getByRole("tab", { name: /First/i });
    const lastTab = screen.getByRole("tab", { name: /Last/i });
    fireEvent.dragStart(firstTab);
    fireEvent.dragOver(lastTab);
    fireEvent.drop(lastTab);

    expect(useWorkspaceStore.getState().tabs.map((tab) => tab.id)).toEqual([
      middle.id,
      last.id,
      first.id,
    ]);
  });

  it("renders English controls without translating the user-defined tab name", () => {
    localStorage.setItem(localeStorageKey, "en");
    const tab = createRequestTab({
      id: "english-request",
      name: "Ödeme API",
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });

    renderTabs();

    expect(screen.getByRole("tablist", { name: "Open requests" })).toBeVisible();
    expect(
      screen.getByRole("tab", { name: /Ödeme API/i }),
    ).toHaveAccessibleDescription("Close Ödeme API tab");
    expect(screen.getByText("Ödeme API")).toBeVisible();
  });
});
