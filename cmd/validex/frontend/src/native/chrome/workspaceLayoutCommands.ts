export type WorkspacePanelSide = "left" | "right";

/**
 * Command port used by chrome controls that do not own workspace layout state.
 *
 * The app shell implements these commands because it knows whether panels are
 * docked or temporarily presented as compact drawers.
 */
export interface WorkspaceLayoutCommands {
  togglePanel(side: WorkspacePanelSide, trigger?: HTMLElement): void;
  resetLayout(trigger?: HTMLElement): void;
}
