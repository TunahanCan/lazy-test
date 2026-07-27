import { afterEach, describe, expect, it, vi } from "vitest";

import { backend } from "./backend";
import type { BootstrapData } from "./types";

type NativeBridge = NonNullable<
  NonNullable<Window["canbridge"]>["Bridge"]
>;

afterEach(() => {
  delete window.canbridge;
});

describe("canbridge adapter", () => {
  it("forwards calls through window.canbridge.Bridge", async () => {
    const bootstrap: BootstrapData = {
      appVersion: "test",
      workspaceId: "native-workspace",
      workspaceName: "Native Workspace",
      environments: [],
      collections: [],
      history: [],
      recentUrls: [],
      onboardingSteps: [],
    };
    const Bootstrap = vi.fn().mockResolvedValue(bootstrap);
    window.canbridge = {
      Bridge: { Bootstrap } as unknown as NativeBridge,
    };

    await expect(backend.bootstrap()).resolves.toEqual(bootstrap);
    expect(Bootstrap).toHaveBeenCalledOnce();
  });
});
