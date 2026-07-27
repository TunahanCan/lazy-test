import * as Tooltip from "@radix-ui/react-tooltip";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRequestTab,
  useWorkspaceStore,
} from "../stores/workspace";
import { RequestTabs } from "./RequestTabs";

function renderTabs() {
  return render(
    <Tooltip.Provider>
      <RequestTabs />
    </Tooltip.Provider>,
  );
}

describe("RequestTabs close behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.persist.clearStorage();
    useWorkspaceStore.setState({
      tabs: [],
      activeTabID: "",
      recentlyClosed: [],
    });
  });

  afterEach(cleanup);

  it("keeps the close button outside the tab and describes dirty close honestly", async () => {
    const tab = createRequestTab({
      id: "dirty-request",
      name: "Dirty request",
      dirty: true,
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });
    renderTabs();

    const tabButton = screen.getByRole("tab", { name: /Dirty request/i });
    const closeButton = screen.getByRole("button", {
      name: "Dirty request sekmesini kapat",
    });
    expect(tabButton.contains(closeButton)).toBe(false);

    fireEvent.click(closeButton);
    expect(
      await screen.findByRole("dialog", {
        name: "Kaydedilmemiş sekme kapatılsın mı?",
      }),
    ).toHaveTextContent(/Reopen closed tab/);
    expect(
      screen.queryByRole("button", { name: "Kaydet" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sekmeyi kapat" }));
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
      within(menu).getByRole("menuitem", { name: "Close other clean tabs" }),
    ).toHaveAttribute("data-disabled");
    expect(
      within(menu).getByRole("menuitem", {
        name: "Close clean tabs to the right",
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

    const closeButton = screen.getByRole("button", {
      name: "Running request sekmesini kapat",
    });
    expect(closeButton).toBeDisabled();
    fireEvent.click(closeButton);
    expect(useWorkspaceStore.getState().tabs).toHaveLength(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
