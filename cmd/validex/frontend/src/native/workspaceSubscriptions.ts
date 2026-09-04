import type { WorkspaceView } from "../lib/types.js";
import {
  workspaceStore,
  type WorkspaceState,
} from "../stores/workspace.js";

export type ActiveWorkspaceListener = (
  state: WorkspaceState,
  previous: WorkspaceState,
) => void;

/**
 * Observes shared workspace state only while its owning workspace is visible.
 * A transition into the workspace also emits, so hidden controllers catch up
 * before the user interacts with them again.
 */
export function subscribeWhenWorkspaceActive(
  view: WorkspaceView,
  listener: ActiveWorkspaceListener,
): () => void {
  return workspaceStore.subscribe((state, previous) => {
    if (state.activeView === view) listener(state, previous);
  });
}
