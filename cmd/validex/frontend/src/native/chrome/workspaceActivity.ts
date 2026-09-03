import type { WorkspaceView } from "../../lib/types.js";

type WorkspaceActivityListener = () => void;

const busyWorkspaces = new Set<WorkspaceView>();
const listeners = new Set<WorkspaceActivityListener>();

export function workspaceIsBusy(view: WorkspaceView): boolean {
  return busyWorkspaces.has(view);
}

export function setWorkspaceBusy(
  view: WorkspaceView,
  busy: boolean,
): void {
  const changed = busy
    ? !busyWorkspaces.has(view)
    : busyWorkspaces.has(view);
  if (!changed) return;
  if (busy) busyWorkspaces.add(view);
  else busyWorkspaces.delete(view);
  for (const listener of listeners) listener();
}

export function subscribeWorkspaceActivity(
  listener: WorkspaceActivityListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
