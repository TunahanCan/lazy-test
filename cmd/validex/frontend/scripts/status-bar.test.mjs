import assert from "node:assert/strict";
import test from "node:test";

const storedValues = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(key) {
      return storedValues.get(key) ?? null;
    },
    removeItem(key) {
      storedValues.delete(key);
    },
    setItem(key, value) {
      storedValues.set(key, String(value));
    },
  },
});

const [
  { getLocale, setLocale },
  { mountStatusBar },
  { workspaceStore },
  {
    beginWorkspaceActivity,
    createWorkspaceActivityScope,
    subscribeWorkspaceActivity,
    workspaceIsBusy,
  },
  { subscribeWhenWorkspaceActive },
] =
  await Promise.all([
    import("../.typescript-build/esm/i18n/locale.js"),
    import("../.typescript-build/esm/native/chrome/statusBar.js"),
    import("../.typescript-build/esm/stores/workspace.js"),
    import("../.typescript-build/esm/native/chrome/workspaceActivity.js"),
    import("../.typescript-build/esm/native/workspaceSubscriptions.js"),
  ]);

const toolLabels = {
  en: {
    mock: "Mock Server",
    json: "JSON Lab",
    diagnostics: "Diagnostics",
    performance: "Performance",
    protocols: "SSE Stream",
    automation: "Automation",
  },
  tr: {
    mock: "Mock Sunucu",
    json: "JSON Laboratuvarı",
    diagnostics: "Tanılama",
    performance: "Performans",
    protocols: "SSE Akışı",
    automation: "Otomasyon",
  },
};

function fakeRoot() {
  return {
    innerHTML: "",
    replaceChildren() {
      this.innerHTML = "";
    },
  };
}

function region(markup, className) {
  const match = markup.match(
    new RegExp(`<div class="${className}">([\\s\\S]*?)</div>`),
  );
  assert.ok(match, `${className} region should be rendered`);
  return match[1];
}

test("status bar follows the active workspace context", () => {
  const originalLocale = getLocale();
  const originalState = workspaceStore.getState();
  workspaceStore.setState({
    activeTabID: "",
    activeView: "requests",
    tabs: [],
  });

  const root = fakeRoot();
  const statusBar = mountStatusBar(root, { appVersion: "9.8.7" });

  try {
    setLocale("en");
    assert.match(root.innerHTML, /0 open requests/);
    assert.match(root.innerHTML, /No active request/);
    assert.doesNotMatch(root.innerHTML, /data-workspace-view=/);

    workspaceStore.setState({
      activeTabID: "draft-request",
      tabs: [
        {
          id: "draft-request",
          dirty: true,
          error: false,
          running: false,
        },
      ],
    });
    assert.match(
      root.innerHTML,
      /Draft saved locally — secret values stay in this session/,
    );
    setLocale("tr");
    assert.match(
      root.innerHTML,
      /Taslak yerelde kaydedildi — gizli değerler yalnızca bu oturumda/,
    );

    for (const locale of ["en", "tr"]) {
      setLocale(locale);
      const ready = locale === "tr" ? "Hazır" : "Ready";

      for (const [view, label] of Object.entries(toolLabels[locale])) {
        workspaceStore.getState().setActiveView(view);

        const summary = region(root.innerHTML, "statusbar-summary");
        const current = region(root.innerHTML, "statusbar-current");
        assert.match(summary, new RegExp(`data-workspace-view="${view}"`));
        assert.ok(summary.includes("native-icon"));
        assert.ok(summary.includes(label));
        assert.ok(current.includes(ready));
        assert.ok(current.includes("Validex 9.8.7"));
        assert.doesNotMatch(
          root.innerHTML,
          /open requests|No active request|açık istek|Etkin istek yok/,
        );
      }
    }
  } finally {
    statusBar.dispose();
    workspaceStore.setState(originalState, true);
    setLocale(originalLocale);
  }
});

test("workspace activity remains busy until every operation releases its lease", () => {
  const originalState = workspaceStore.getState();
  workspaceStore.setState({ activeView: "automation" });
  const root = fakeRoot();
  const statusBar = mountStatusBar(root, { appVersion: "9.8.7" });
  let notifications = 0;
  const unsubscribe = subscribeWorkspaceActivity(() => {
    notifications += 1;
  });
  const runner = beginWorkspaceActivity("automation");
  const network = beginWorkspaceActivity("automation");

  try {
    assert.equal(workspaceIsBusy("automation"), true);
    assert.equal(notifications, 1);
    assert.match(root.innerHTML, /Working…/);

    runner.dispose();
    assert.equal(workspaceIsBusy("automation"), true);
    assert.equal(notifications, 1);
    assert.match(root.innerHTML, /Working…/);

    runner.dispose();
    assert.equal(notifications, 1, "lease disposal is idempotent");

    network.dispose();
    assert.equal(workspaceIsBusy("automation"), false);
    assert.equal(notifications, 2);
    assert.match(root.innerHTML, /Ready/);
  } finally {
    runner.dispose();
    network.dispose();
    unsubscribe();
    statusBar.dispose();
    workspaceStore.setState(originalState, true);
  }
});

test("workspace activity scope releases unfinished controller work", () => {
  const scope = createWorkspaceActivityScope("protocols");
  const first = scope.begin();
  scope.begin();
  assert.equal(workspaceIsBusy("protocols"), true);

  first.dispose();
  assert.equal(workspaceIsBusy("protocols"), true);

  scope.dispose();
  assert.equal(workspaceIsBusy("protocols"), false);
  assert.throws(() => scope.begin(), /scope is disposed/);
});

test("workspace observers update only while their owner is active", () => {
  const originalState = workspaceStore.getState();
  workspaceStore.setState({ activeView: "requests" });
  let renders = 0;
  const unsubscribe = subscribeWhenWorkspaceActive("mock", () => {
    renders += 1;
  });

  try {
    workspaceStore.setState({ leftWidth: originalState.leftWidth + 1 });
    assert.equal(renders, 0);

    workspaceStore.setState({ activeView: "mock" });
    assert.equal(renders, 1, "activation catches the controller up");

    workspaceStore.setState({ rightWidth: originalState.rightWidth + 1 });
    assert.equal(renders, 2);

    workspaceStore.setState({ activeView: "requests" });
    workspaceStore.setState({ leftWidth: originalState.leftWidth + 2 });
    assert.equal(renders, 2);
  } finally {
    unsubscribe();
    workspaceStore.setState(originalState, true);
  }
});
