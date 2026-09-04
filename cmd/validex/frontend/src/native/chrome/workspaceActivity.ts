import type { Disposable } from "../../core/dom.js";
import type { WorkspaceView } from "../../lib/types.js";

type WorkspaceActivityListener = () => void;

export interface WorkspaceActivityLease extends Disposable {
  readonly view: WorkspaceView;
}

export interface WorkspaceActivityScope extends Disposable {
  readonly view: WorkspaceView;
  begin(): WorkspaceActivityLease;
}

const activityCounts = new Map<WorkspaceView, number>();
const listeners = new Set<WorkspaceActivityListener>();

function notifyActivityChanged(): void {
  for (const listener of listeners) listener();
}

export function workspaceIsBusy(view: WorkspaceView): boolean {
  return (activityCounts.get(view) ?? 0) > 0;
}

/**
 * Acquires one unit of workspace activity. The workspace remains busy until
 * every independently acquired lease has been disposed.
 */
export function beginWorkspaceActivity(
  view: WorkspaceView,
): WorkspaceActivityLease {
  const current = activityCounts.get(view) ?? 0;
  activityCounts.set(view, current + 1);
  if (current === 0) notifyActivityChanged();

  let disposed = false;
  return {
    view,
    dispose() {
      if (disposed) return;
      disposed = true;
      const remaining = Math.max(0, (activityCounts.get(view) ?? 1) - 1);
      if (remaining > 0) {
        activityCounts.set(view, remaining);
        return;
      }
      activityCounts.delete(view);
      notifyActivityChanged();
    },
  };
}

/**
 * Owns all leases started by one mounted controller. Completed leases remove
 * themselves from the scope; disposing the controller releases any remaining
 * work without retaining every historical operation.
 */
export function createWorkspaceActivityScope(
  view: WorkspaceView,
): WorkspaceActivityScope {
  const leases = new Set<WorkspaceActivityLease>();
  let disposed = false;

  return {
    view,
    begin() {
      if (disposed) {
        throw new Error(`Workspace activity scope is disposed: ${view}`);
      }
      const activity = beginWorkspaceActivity(view);
      let released = false;
      const lease: WorkspaceActivityLease = {
        view,
        dispose() {
          if (released) return;
          released = true;
          leases.delete(lease);
          activity.dispose();
        },
      };
      leases.add(lease);
      return lease;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const lease of [...leases]) lease.dispose();
    },
  };
}

export function subscribeWorkspaceActivity(
  listener: WorkspaceActivityListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
