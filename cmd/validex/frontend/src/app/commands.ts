import { backend } from "../lib/backend.js";
import type { ImportSpecResult, RequestTab } from "../lib/types.js";
import { workspaceStore } from "../stores/workspace.js";

let openAPIImportInFlight: Promise<ImportSpecResult> | undefined;

export type RequestDraftOverrides = Partial<
  Pick<
    RequestTab,
    | "name"
    | "method"
    | "url"
    | "body"
    | "headers"
    | "collectionId"
    | "literalValues"
    | "requestSection"
    | "openApi"
  >
>;

/**
 * Application-level commands keep use cases shared by chrome, shortcuts, and
 * workspaces out of individual DOM controllers.
 */
export const applicationCommands = {
  openRequestDraft(overrides: RequestDraftOverrides = {}): void {
    workspaceStore.getState().openTab({
      ...overrides,
      dirty: true,
    });
  },

  importOpenAPI(): Promise<ImportSpecResult> {
    openAPIImportInFlight ??= backend
      .importOpenAPI()
      .then((result) => {
        if (!result.canceled && !result.error) {
          workspaceStore.getState().setImportedSpec(result);
        }
        return result;
      })
      .finally(() => {
        openAPIImportInFlight = undefined;
      });
    return openAPIImportInFlight;
  },
} as const;
