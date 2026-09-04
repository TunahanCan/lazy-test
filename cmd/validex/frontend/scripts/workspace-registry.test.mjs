import assert from "node:assert/strict";
import test from "node:test";

import {
  isWorkspaceView,
  workspaceViews,
} from "../.typescript-build/esm/lib/types.js";
import {
  isToolWorkspaceView,
  toolWorkspaceDefinitions,
  workspaceDefinition,
  workspaceDefinitions,
} from "../.typescript-build/esm/native/workspaces.js";

test("workspace registry is the canonical ordered catalog", () => {
  assert.deepEqual(
    workspaceDefinitions.map((definition) => definition.id),
    workspaceViews,
  );
  assert.equal(new Set(workspaceViews).size, workspaceViews.length);
  assert.equal(workspaceDefinitions[0].group, "primary");
  assert.ok(
    workspaceDefinitions.slice(1).every((definition) =>
      definition.group === "tools" &&
      typeof definition.load === "function" &&
      definition.compactLabelKey.length > 0
    ),
  );
  assert.deepEqual(
    toolWorkspaceDefinitions.map((definition) => definition.id),
    workspaceViews.slice(1),
  );
});

test("workspace guards reject persisted and DOM values outside the registry", () => {
  assert.equal(isWorkspaceView("performance"), true);
  assert.equal(isWorkspaceView("unknown"), false);
  assert.equal(isWorkspaceView(null), false);
  assert.equal(isToolWorkspaceView("requests"), false);
  assert.equal(isToolWorkspaceView("mock"), true);
  assert.equal(isToolWorkspaceView("unknown"), false);
  assert.equal(workspaceDefinition("json").icon, "braces");
  assert.throws(() => workspaceDefinition("unknown"), /Unknown workspace/);
});
